// Outside spending: independent expenditures from Schedule D rows and counted 496 rows, attributed to a
// candidate or measure side (spec ingest rule 9; data rulings D7 and D8). Pure: the log is the only side
// channel. Erasable TypeScript only so Node can run it with type stripping.
import type { Committee, OutsideGroup, OutsideTotal, RacesFile, Unmatched } from "../elections/types.ts";
import type { CalRow } from "./raw.ts";
import { belongsTo, type Selection } from "./select.ts";

type Side = "support" | "oppose";
export type Attribution = { target: string; side: Side; why: string } | { notLocal: string };

type Target = { key: string; committees: Committee[] };

const squash = (s: string) => s.trim().replace(/\s+/g, " ");
const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/ +/g, " ")
    .trim();

/** Every summary key on the ballot, with the committees that speak for it. */
function ballotTargets(races: RacesFile): Map<string, Target> {
  const out = new Map<string, Target>();
  for (const race of races.races) {
    if (race.kind === "office") {
      for (const c of race.candidates) {
        out.set(`${race.slug}/${c.slug}`, { key: `${race.slug}/${c.slug}`, committees: c.committees });
      }
    } else {
      for (const side of ["yes", "no"] as const) {
        out.set(`${race.slug}/${side}`, {
          key: `${race.slug}/${side}`,
          committees: race.sides[side].committees,
        });
      }
    }
  }
  return out;
}

/** Candidate names ("first last", normalized) → summary key: ballot name and "First Last" from legalName. */
function candidateNames(races: RacesFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const race of races.races) {
    if (race.kind !== "office") continue;
    for (const c of race.candidates) {
      const key = `${race.slug}/${c.slug}`;
      out.set(nameKey(c.ballotName), key);
      const comma = c.legalName.indexOf(",");
      if (comma > 0) out.set(nameKey(`${c.legalName.slice(comma + 1)} ${c.legalName.slice(0, comma)}`), key);
    }
  }
  return out;
}

const SIDES: Record<string, Side> = { S: "support", O: "oppose" };

/** D7: the ballot target a row names by itself, or a reason it names none. */
function matchRow(
  r: CalRow,
  names: Map<string, string>,
  races: RacesFile,
): { target: string; side: Side } | { reason: string } {
  const side = SIDES[r.supOpp.trim().toUpperCase()];
  let target: string | undefined;
  const last = squash(r.candLast);
  const first = squash(r.candFirst);
  if (last || first) {
    target = names.get(nameKey(`${first} ${last}`)) ?? names.get(nameKey(`${last} ${first}`));
  }
  if (!target) {
    const letter = r.balNum.trim().toUpperCase();
    if (/^[A-Z]{1,2}$/.test(letter)) {
      const race = races.races.find(
        (x) => x.kind === "measure" && x.slug === `measure-${letter.toLowerCase()}`,
      );
      // Opposing a measure counts against its Yes side.
      if (race) target = `${race.slug}/yes`;
    }
  }
  if (!target) return { reason: "names no candidate or measure on this ballot" };
  if (!side) return { reason: `names ${target} but Sup_Opp_Cd is "${r.supOpp}"` };
  return { target, side };
}

function describeRow(r: CalRow): string {
  const parts = [squash(r.description)];
  const cand = squash(`${r.candFirst} ${r.candLast}`);
  if (cand) parts.push(`candidate: ${cand}`);
  if (r.balName || r.balNum) parts.push(`measure: ${squash(`${r.balName} ${r.balNum}`)}`);
  if (r.supOpp) parts.push(`Sup_Opp_Cd: ${r.supOpp}`);
  return parts.filter(Boolean).join("; ");
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function outsideSpending(
  input: { selection: Selection; races: RacesFile; attributions: Record<string, Attribution> },
  log: string[],
): { groups: OutsideGroup[]; unmatched: Unmatched[]; counted: CalRow[] } {
  const { selection, races, attributions } = input;
  const targets = ballotTargets(races);
  const names = candidateNames(races);

  // Schedule D independent expenditures from kept period reports, then counted 496 rows.
  const rows: CalRow[] = [];
  for (const f of selection.period) {
    for (const r of f.rows) {
      if (r.memo || r.formType !== "D") continue;
      if (r.expnCode.trim().toUpperCase() !== "IND") continue;
      rows.push(r);
    }
  }
  for (const r of selection.late) if (r.formType === "F496" && !r.memo) rows.push(r);
  rows.sort((a, b) => a.filerKey.localeCompare(b.filerKey) || a.tranId.localeCompare(b.tranId));

  const totals = new Map<string, Map<string, number>>();
  const groupNames = new Map<string, string>();
  const unmatched: Unmatched[] = [];
  const used = new Set<string>();
  // Rows that reached a group or the unmatched list, so callers can tell which filings were used.
  const counted: CalRow[] = [];

  for (const r of rows) {
    const key = `${r.filerKey}:${r.tranId}`;
    const label = `outside ${r.formType} ${key} ${dollars(r.cents)} ${r.tranDate ?? "no date"} "${describeRow(r)}"`;
    const attribution = Object.hasOwn(attributions, key) ? attributions[key] : undefined;
    if (attribution) used.add(key);
    if (attribution && "notLocal" in attribution) {
      log.push(`${label} -> not local: ${attribution.notLocal}`);
      continue;
    }
    let resolved: { target: string; side: Side };
    if (attribution) {
      if (!targets.has(attribution.target)) {
        throw new Error(`outside-attributions ${key}: target "${attribution.target}" is not on the ballot`);
      }
      resolved = { target: attribution.target, side: attribution.side };
      log.push(`${label} -> attributed (${attribution.why})`);
    } else {
      const m = matchRow(r, names, races);
      if ("reason" in m) {
        log.push(`${label} -> unmatched: ${m.reason}`);
        counted.push(r);
        unmatched.push({
          filerKey: r.filerKey,
          filer: squash(r.filerName),
          tranId: r.tranId,
          formType: r.formType,
          date: r.tranDate,
          cents: r.cents,
          description: describeRow(r),
        });
        continue;
      }
      resolved = m;
      log.push(`${label} -> ${m.side} ${m.target}`);
    }

    const target = targets.get(resolved.target);
    if (target && target.committees.some((c) => belongsTo(c, r.filerKey, r.filerName))) {
      log.push(`${label}: ${resolved.target} is the filer's own campaign, not outside spending`);
      continue;
    }
    const group = totals.get(r.filerKey) ?? new Map<string, number>();
    const k = `${resolved.target}\t${resolved.side}`;
    group.set(k, (group.get(k) ?? 0) + r.cents);
    totals.set(r.filerKey, group);
    // The longest seen name is stable across input order; names differ only by typos and spacing.
    const name = squash(r.filerName);
    const held = groupNames.get(r.filerKey);
    if (held === undefined || name.length > held.length || (name.length === held.length && name < held)) {
      groupNames.set(r.filerKey, name);
    }
    counted.push(r);
  }

  for (const key of Object.keys(attributions).sort()) {
    if (!used.has(key)) log.push(`outside attribution ${key} matched no counted row`);
  }

  const groups: OutsideGroup[] = [...totals.keys()].sort().map((key) => {
    const list: OutsideTotal[] = [...(totals.get(key) ?? new Map<string, number>())]
      .map(([k, cents]) => {
        const [target, side] = k.split("\t");
        return { target, side: side as Side, cents };
      })
      .filter((t) => t.cents !== 0)
      .sort((a, b) => a.target.localeCompare(b.target) || a.side.localeCompare(b.side));
    return { key, name: groupNames.get(key) ?? key, totals: list };
  });
  return { groups: groups.filter((g) => g.totals.length > 0), unmatched, counted };
}

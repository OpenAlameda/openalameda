// The ingest pipeline: loaded filings + hand-kept election files → finance.json (spec "Ingest").
// Pure: the CLI in scripts/ingest.ts does the file I/O. Erasable TypeScript only so Node can run it with
// type stripping.
import {
  BANDS,
  DONOR_TYPES,
  LOCALITIES,
  type BandCents,
  type AppliedCorrection,
  type Candidate,
  type Committee,
  type Correction,
  type Filing,
  type FinanceFile,
  type Matrix,
  type MoneySummary,
  type RacesFile,
  type UnreadFiling,
} from "../elections/types.ts";
import { summarize } from "./money.ts";
import { outsideSpending, type Attribution } from "./outside.ts";
import { toCents, type CalRow, type ManifestEntry } from "./raw.ts";
import { applyLocalityOverrides } from "./corrections.ts";
import { belongsTo, selectFilings, type LoadedFiling } from "./select.ts";

export type IngestInput = {
  filings: LoadedFiling[];
  manifest: ManifestEntry[];
  races: RacesFile;
  attributions: Record<string, Attribution>;
  /** Corrections already applied to `filings`' rows; ingest records them in finance.json. */
  corrections: Correction[];
  countyZips: Set<string>;
  collectedOn: string;
};

type Entrant = {
  key: string;
  race: string;
  candidateSlug: string | null;
  committees: Committee[];
  candidate: Candidate | null;
};

/** Every candidate and measure side, in races.json display order. */
function entrants(races: RacesFile): Entrant[] {
  const out: Entrant[] = [];
  for (const race of races.races) {
    if (race.kind === "office") {
      for (const c of race.candidates) {
        out.push({
          key: `${race.slug}/${c.slug}`,
          race: race.slug,
          candidateSlug: c.slug,
          committees: c.committees,
          candidate: c,
        });
      }
    } else {
      for (const side of ["yes", "no"] as const) {
        out.push({
          key: `${race.slug}/${side}`,
          race: race.slug,
          candidateSlug: side,
          committees: race.sides[side].committees,
          candidate: null,
        });
      }
    }
  }
  return out;
}

const PERIOD_FAMILIES = new Set(["460", "450", "460-T"]);
const isLate = (f: LoadedFiling) => f.entry.family === "497" || f.entry.family === "496";
const ownedBy = (committees: Committee[], filerKey: string, filerName: string) =>
  committees.some((c) => belongsTo(c, filerKey, filerName));

function toFiling(f: LoadedFiling): Filing {
  return {
    filerKey: f.filerKey,
    filer: f.filerName,
    form: f.entry.form,
    amendment: f.entry.amendment,
    filed: f.entry.filed,
    period: f.entry.period ? { from: f.entry.period.from, thru: f.entry.period.thru } : null,
    source: /\.xls$/i.test(f.entry.path) ? "efile" : "paper",
    file: f.entry.path,
  };
}

export function ingest(input: IngestInput): { finance: FinanceFile; log: string[] } {
  const log: string[] = [];
  const { races, countyZips } = input;
  // Locality corrections set a derived category on a row, so they apply before anything is counted.
  const allFilings = applyLocalityOverrides(input.filings, input.corrections, countyZips, log);
  const selection = selectFilings(allFilings, log);
  const people = entrants(races);
  const raceCommittees = people.flatMap((p) => p.committees);

  // R17: one committee under two filer keys (a numeric Filer_ID in one export, blank in another) would
  // split its amendments and late windows across keys and double-count; say so in the log.
  for (const c of raceCommittees) {
    const keys = new Set<string>();
    for (const f of allFilings) {
      for (const key of new Set([f.filerKey, ...f.rows.map((r) => r.filerKey)])) {
        if (belongsTo(c, key, f.filerName)) keys.add(key);
      }
    }
    if (keys.size > 1) {
      log.push(
        `committee ${c.name}: filings resolve to more than one filer key: ${[...keys].sort().join(", ")}`,
      );
    }
  }

  const summaries: Record<string, MoneySummary> = {};
  for (const p of people) {
    const filings = selection.period.filter((f) => ownedBy(p.committees, f.filerKey, f.filerName));
    const late = selection.late.filter((r) => ownedBy(p.committees, r.filerKey, r.filerName));
    summaries[p.key] = summarize({ filings, late, candidate: p.candidate, countyZips }, log);
  }

  const outside = outsideSpending({ selection, races, attributions: input.attributions }, log);
  for (const g of outside.groups) {
    for (const t of g.totals) {
      const s = summaries[t.target];
      if (t.side === "support") s.outside.supportCents += t.cents;
      else s.outside.opposeCents += t.cents;
    }
  }

  // 496 rows that rule 2 or the late dedupe left out, so every 496 row shows up in the log.
  const counted = new Set<CalRow>(selection.late);
  for (const f of allFilings) {
    for (const r of f.rows) {
      if (r.formType !== "F496" || counted.has(r)) continue;
      const why = r.memo
        ? "memo row"
        : `dated ${r.tranDate ?? "never"}, on or before the thru of the filer's latest 460 (or a duplicate)`;
      log.push(
        `outside F496 ${r.filerKey}:${r.tranId} $${(r.cents / 100).toFixed(2)} "${r.description}" not counted: ${why}`,
      );
    }
  }

  // Filings used: race committees' kept period reports, late reports with a counted race-committee row,
  // and any filing with a row that reached outside spending or the unmatched list.
  const usedFiles = new Set<string>();
  for (const f of selection.period) {
    if (ownedBy(raceCommittees, f.filerKey, f.filerName)) usedFiles.add(f.entry.path);
  }
  for (const r of selection.late) {
    if (ownedBy(raceCommittees, r.filerKey, r.filerName)) usedFiles.add(r.file);
  }
  for (const r of outside.counted) usedFiles.add(r.file);
  const used = allFilings.filter((f) => usedFiles.has(f.entry.path));
  for (const f of allFilings) {
    if (!usedFiles.has(f.entry.path))
      log.push(`not used for this election: ${f.entry.path} (${f.filerName})`);
  }

  let dataThrough = "";
  for (const f of used) {
    const date = isLate(f)
      ? f.entry.filed
      : PERIOD_FAMILIES.has(f.entry.family)
        ? (f.entry.period?.thru ?? "")
        : "";
    if (date > dataThrough) dataThrough = date;
  }

  const unreadFilings: UnreadFiling[] = [];
  for (const m of input.manifest) {
    if (m.path !== "paper-not-downloaded") continue;
    const period = m.period ? `${m.period.from} to ${m.period.thru}` : "";
    if (ownedBy(raceCommittees, `name:${m.filer}`, m.filer)) {
      unreadFilings.push({ filer: m.filer, form: m.form, filed: m.filed, period, note: m.note });
    } else {
      log.push(
        `not downloaded, not a race committee's filing: ${m.filer} ${m.form} filed ${m.filed} ${period}`,
      );
    }
  }

  // Each correction, with the race and candidate whose committee filed the report it touches.
  const corrections: AppliedCorrection[] = input.corrections.map((c) => {
    const filing = allFilings.find((f) => f.entry.path === c.filing);
    if (!filing) throw new Error(`correction ${c.filing} ${c.tranId}: no such filing`);
    // A correction counts only when its row does: a superseded, deduped or unused copy would publish a
    // reading that no total reflects.
    const row = filing.rows.find((r) => r.tranId === c.tranId);
    const at = `correction ${c.filing} ${c.tranId}`;
    if (selection.superseded.includes(filing)) {
      throw new Error(`${at}: the filing is superseded by an amendment, so its row is not counted`);
    }
    if (isLate(filing) && (!row || !selection.late.includes(row))) {
      throw new Error(
        `${at}: the late-report row was dropped by the late-window dedupe, so it is not counted`,
      );
    }
    if (!usedFiles.has(filing.entry.path)) {
      throw new Error(`${at}: the filing is not used for this election, so its row is not counted`);
    }
    const owner = people.find((p) => ownedBy(p.committees, filing.filerKey, filing.filerName));
    return { ...c, race: owner?.race ?? null, candidate: owner?.candidateSlug ?? null };
  });

  const finance: FinanceFile = {
    election: races.election,
    dataThrough,
    collectedOn: input.collectedOn,
    summaries,
    outsideGroups: outside.groups,
    unmatched: outside.unmatched,
    filings: used.map(toFiling),
    unreadFilings,
    corrections,
  };
  return { finance, log };
}

// ---- Serialization: fixed key order, sorted arrays, 2-space JSON, trailing newline. ----

const cmp = (...pairs: [string | number, string | number][]) => {
  for (const [a, b] of pairs) {
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
};

function bandsOf(b: BandCents): BandCents {
  return Object.fromEntries(BANDS.map((k) => [k, b[k]])) as BandCents;
}

function matrixOf(m: Matrix): Matrix {
  return Object.fromEntries(
    LOCALITIES.map((l) => [
      l,
      Object.fromEntries(DONOR_TYPES.map((t) => [t, { cents: m[l][t].cents, count: m[l][t].count }])),
    ]),
  ) as Matrix;
}

function summaryOf(s: MoneySummary): MoneySummary {
  return {
    status: s.status,
    paper: s.paper,
    raisedCents: s.raisedCents,
    spentCents: s.spentCents,
    ownCents: s.ownCents,
    carriedCents: s.carriedCents,
    loansFromCandidateCents: s.loansFromCandidateCents,
    otherLoansCents: s.otherLoansCents,
    contributionCount: s.contributionCount,
    matrix: matrixOf(s.matrix),
    bands: bandsOf(s.bands),
    bandsByCell: Object.fromEntries(
      LOCALITIES.map((l) => [
        l,
        Object.fromEntries(DONOR_TYPES.map((t) => [t, bandsOf(s.bandsByCell[l][t])])),
      ]),
    ) as MoneySummary["bandsByCell"],
    unknownLocalityCents: s.unknownLocalityCents,
    outside: { supportCents: s.outside.supportCents, opposeCents: s.outside.opposeCents },
    reportedDiffs: s.reportedDiffs
      .map((d) => ({
        filed: d.filed,
        line: d.line,
        label: d.label,
        reportedCents: d.reportedCents,
        scheduleCents: d.scheduleCents,
      }))
      .sort((a, b) => cmp([a.filed, b.filed], [a.line, b.line], [a.label, b.label])),
  };
}

export function serializeFinance(f: FinanceFile): string {
  const out: FinanceFile = {
    election: f.election,
    dataThrough: f.dataThrough,
    collectedOn: f.collectedOn,
    // Summaries keep races.json display order, which the races file fixes.
    summaries: Object.fromEntries(Object.entries(f.summaries).map(([k, s]) => [k, summaryOf(s)])),
    outsideGroups: f.outsideGroups
      .map((g) => ({
        key: g.key,
        name: g.name,
        totals: g.totals
          .map((t) => ({ target: t.target, side: t.side, cents: t.cents }))
          .sort((a, b) => cmp([a.target, b.target], [a.side, b.side])),
      }))
      .sort((a, b) => cmp([a.key, b.key])),
    unmatched: f.unmatched
      .map((u) => ({
        filerKey: u.filerKey,
        filer: u.filer,
        tranId: u.tranId,
        formType: u.formType,
        date: u.date,
        cents: u.cents,
        description: u.description,
      }))
      .sort((a, b) => cmp([a.filerKey, b.filerKey], [a.tranId, b.tranId], [a.formType, b.formType])),
    filings: f.filings
      .map((x) => ({
        filerKey: x.filerKey,
        filer: x.filer,
        form: x.form,
        amendment: x.amendment,
        filed: x.filed,
        period: x.period ? { from: x.period.from, thru: x.period.thru } : null,
        source: x.source,
        file: x.file,
      }))
      .sort((a, b) => cmp([a.filer, b.filer], [a.filed, b.filed], [a.file, b.file])),
    unreadFilings: f.unreadFilings
      .map((u) => ({ filer: u.filer, form: u.form, filed: u.filed, period: u.period, note: u.note }))
      .sort((a, b) => cmp([a.filer, b.filer], [a.filed, b.filed], [a.period, b.period])),
    corrections: f.corrections
      .map((c) => ({
        filing: c.filing,
        tranId: c.tranId,
        field: c.field,
        asFiled: c.asFiled,
        correctedTo: c.correctedTo,
        reason: c.reason,
        decidedBy: c.decidedBy,
        decidedAt: c.decidedAt,
        race: c.race,
        candidate: c.candidate,
      }))
      .sort((a, b) => cmp([a.filing, b.filing], [a.tranId, b.tranId], [a.field, b.field])),
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

// ---- Totals cross-check against the Advanced Search index export (reported, never asserted). ----

const INDEX_COLUMNS = ["Filer Name", "Form Type", "Amendment #", "Filing Date", "Transaction Type", "Amount"];
const PERIOD_TYPES = new Set(["Monetary Contributions Received", "Nonmonetary Contributions Received"]);
const LATE_TYPES = new Set(["Contribution Received"]);
const squashLower = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const usd = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/**
 * Per candidate or measure side: ingest's raised vs. the index rows (contributions on period reports,
 * contributions on 497s) of the filings ingest used. Amended reports in the index have a blank
 * transaction type, so their rows cannot be summed and are counted in the note instead.
 */
export function crossCheck(
  index: Record<string, string>[],
  finance: FinanceFile,
  races: RacesFile,
): string[] {
  const missing = INDEX_COLUMNS.filter((c) => !(index[0] && c in index[0]));
  if (index.length === 0) return ["cross-check skipped: the index export has no rows"];
  if (missing.length > 0)
    return [`cross-check skipped: the index export lacks columns ${missing.join(", ")}`];

  const lines: string[] = [];
  for (const p of entrants(races)) {
    if (p.committees.length === 0) continue;
    const summary = finance.summaries[p.key];
    const filings = finance.filings.filter((f) => ownedBy(p.committees, f.filerKey, f.filer));
    const names = new Set(p.committees.flatMap((c) => [c.name, ...(c.aliases ?? [])]).map(squashLower));
    for (const f of filings) names.add(squashLower(f.filer));

    let indexCents = 0;
    let blank = 0;
    let found = 0;
    for (const f of filings) {
      const family = f.form.replace(/-A$/, "");
      const rows = index.filter((r) => {
        if (!names.has(squashLower(r["Filer Name"]))) return false;
        const form = (r["Form Type"].trim().split(/\s+/)[0] ?? "").replace(/-A$/, "");
        if (form !== family || r["Filing Date"].trim().slice(0, 10) !== f.filed) return false;
        const amendment = r["Amendment #"].trim();
        return amendment === "" || Number(amendment) === f.amendment;
      });
      if (rows.length > 0) found += 1;
      const types = family === "497" ? LATE_TYPES : PERIOD_TYPES;
      for (const r of rows) {
        const type = r["Transaction Type"].trim();
        if (type === "") blank += 1;
        else if (types.has(type)) indexCents += toCents(r["Amount"]) ?? 0;
      }
    }
    const notes = [`${found} of ${filings.length} filings found in the index`];
    if (blank > 0) notes.push(`${blank} rows with a blank transaction type not summed`);
    if (summary.paper) notes.push("paper filer: the index carries no paper transactions");
    lines.push(
      `cross-check ${p.key}: ingest ${usd(summary.raisedCents)}, index ${usd(indexCents)}, diff ${usd(summary.raisedCents - indexCents)} (${notes.join("; ")})`,
    );
  }
  return lines;
}

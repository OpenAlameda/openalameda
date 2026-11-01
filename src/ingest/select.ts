// Which filings and late-report rows count (spec ingest rules 1, 2 and 4; data rulings D2, D3, D5).
// Pure: callers load the files. Erasable TypeScript only so Node can run it with type stripping.
import type { Committee } from "../elections/types.ts";
import { squash } from "./common.ts";
import type { CalRow, ManifestEntry, SummaryLine } from "./raw.ts";

export type LoadedFiling = {
  entry: ManifestEntry;
  /** Whether the rows came from an efile export or a transcribed paper filing. */
  source: "efile" | "paper";
  filerKey: string;
  filerName: string;
  rows: CalRow[];
  summary: SummaryLine[] | null;
};

export type Selection = {
  /** The latest version of each period report: (filer key, form family, thru date). */
  period: LoadedFiling[];
  /** Period reports replaced by a later amendment. */
  superseded: LoadedFiling[];
  /** Counted, non-memo `F497P1` and `F496` rows, one per (filer key, Tran_ID). */
  late: CalRow[];
  /** Filer key → latest thru date across its kept period reports, any family. */
  latestThru: Map<string, string>;
};

export const PERIOD_FAMILIES = new Set(["460", "450", "460-T"]);
export const LATE_FAMILIES = new Set(["497", "496"]);
const LATE_FORMS = new Set(["F497P1", "F496"]);
/** Period report families that carry Schedule D (460 and its amendments and termination form). */
const SCHEDULE_D_FAMILIES = new Set(["460", "460-T"]);

/** True when `a` is a later version than `b`: higher amendment, then later filed date. */
function newer(a: ManifestEntry, b: ManifestEntry): boolean {
  if (a.amendment !== b.amendment) return a.amendment > b.amendment;
  return a.filed > b.filed;
}

export function selectFilings(filings: LoadedFiling[], log: string[]): Selection {
  const latest = new Map<string, LoadedFiling>();
  const superseded: LoadedFiling[] = [];
  const lateFilings: LoadedFiling[] = [];

  for (const f of filings) {
    const { family, period, path } = f.entry;
    if (LATE_FAMILIES.has(family)) {
      lateFilings.push(f);
      continue;
    }
    if (!PERIOD_FAMILIES.has(family)) {
      log.push(`not counted: ${path} (form ${f.entry.form} is neither a period nor a late report)`);
      continue;
    }
    if (!period) log.push(`period report without a period in the manifest: ${path}`);
    const thru = period?.thru ?? "";
    const disagree = f.rows.filter((r) => r.thruDate !== null && r.thruDate !== thru);
    if (disagree.length > 0) {
      const dates = [...new Set(disagree.map((r) => r.thruDate))].sort().join(", ");
      log.push(
        `${path}: ${disagree.length} rows have Thru_Date ${dates}, manifest says ${thru}; using the manifest`,
      );
    }
    const key = `${f.filerKey}\t${family}\t${thru}`;
    const held = latest.get(key);
    if (!held) {
      latest.set(key, f);
    } else if (newer(f.entry, held.entry)) {
      superseded.push(held);
      latest.set(key, f);
    } else {
      superseded.push(f);
    }
  }

  // Keep the input order for the kept reports so output stays deterministic.
  const kept = new Set(latest.values());
  const period = filings.filter((f) => kept.has(f));
  for (const f of superseded) log.push(`superseded: ${f.entry.path}`);

  const latestThru = new Map<string, string>();
  // R18: the 496 cutoff counts only reports with a Schedule D (460 family). A 450 reports independent
  // expenditures as F450P5, which is not outside spending, so a 450-only spender's 496s always count.
  const latestScheduleDThru = new Map<string, string>();
  for (const f of period) {
    const thru = f.entry.period?.thru;
    if (!thru) continue;
    const prev = latestThru.get(f.filerKey);
    if (!prev || thru > prev) latestThru.set(f.filerKey, thru);
    if (!SCHEDULE_D_FAMILIES.has(f.entry.family)) continue;
    const prevD = latestScheduleDThru.get(f.filerKey);
    if (!prevD || thru > prevD) latestScheduleDThru.set(f.filerKey, thru);
  }

  // Dedupe late rows by (filer key, Tran_ID), keeping the latest-filed copy, then apply the date rule.
  const copies = new Map<string, { row: CalRow; entry: ManifestEntry }>();
  for (const f of lateFilings) {
    for (const r of f.rows) {
      if (!LATE_FORMS.has(r.formType) || r.memo) continue;
      const key = `${f.filerKey}\t${r.tranId}`;
      const held = copies.get(key);
      if (
        !held ||
        f.entry.filed > held.entry.filed ||
        (f.entry.filed === held.entry.filed && newer(f.entry, held.entry))
      ) {
        if (held)
          log.push(
            `late duplicate ${f.filerKey} ${r.tranId}: keeping ${f.entry.path} over ${held.entry.path}`,
          );
        copies.set(key, { row: r, entry: f.entry });
      } else {
        log.push(`late duplicate ${f.filerKey} ${r.tranId}: keeping ${held.entry.path} over ${f.entry.path}`);
      }
    }
  }

  const late: CalRow[] = [];
  for (const [key, { row, entry }] of copies) {
    const filer = key.slice(0, key.indexOf("\t"));
    const thru = (row.formType === "F496" ? latestScheduleDThru : latestThru).get(filer);
    if (thru === undefined) {
      late.push(row);
    } else if (row.tranDate === null) {
      log.push(`late row without a date not counted: ${entry.path} ${row.tranId}`);
    } else if (row.tranDate > thru) {
      late.push(row);
    }
  }

  return { period, superseded, late, latestThru };
}

/**
 * A filing belongs to a committee by numeric Filer_ID; a filer without one, or a committee
 * listed without an id, matches by exact (whitespace-normalized) name or alias.
 */
export function belongsTo(c: Committee, filerKey: string, filerName: string): boolean {
  const numeric = !filerKey.startsWith("name:");
  if (numeric && c.id !== null) return c.id === filerKey;
  const name = squash(filerName);
  return [c.name, ...(c.aliases ?? [])].some((n) => squash(n) === name);
}

// Transcription corrections: hand-kept decisions to read a filing's field differently from how the filer
// wrote it. Applied as an overlay on the rows read from raw data, before any counting rule runs; the raw
// files are never written. A correction that no longer fits its row stops the ingest rather than apply
// silently. Pure: the CLI does the file I/O. Erasable TypeScript only so Node can run it with type stripping.
import { LOCALITIES, type Correction } from "../elections/types.ts";
import { locality } from "./money.ts";
import { tranIdOf, type CalRow } from "./raw.ts";
import type { LoadedFiling } from "./select.ts";

export type FilingRecords = { path: string; records: Record<string, string>[] };

const KEYS = [
  "filing",
  "tranId",
  "field",
  "asFiled",
  "correctedTo",
  "reason",
  "decidedBy",
  "decidedAt",
] as const;

/**
 * The only columns a correction may name. None identifies a person, so a correction's values can go in
 * the log, finance.json and the candidate page without naming anyone.
 */
export const CORRECTABLE_FIELDS = [
  "Entity_ZIP4",
  "Entity_City",
  "Entity_ST",
  "Entity_Cd",
  "Tran_Date",
  "Amount",
  "Memo_Code",
] as const;

/**
 * The derived locality (alameda, county, other), which is not a column: a correction to it overrides the
 * category the ingest derived from the row's ZIP. `asFiled` is that derived reading, or "unknown" for a
 * row with no usable ZIP; `correctedTo` is one of the locality keys.
 */
export const LOCALITY_FIELD = "locality";

/** Keys that must be non-empty; `asFiled` may be empty, to fill in a field the filer left blank. */
const REQUIRED = KEYS.filter((k) => k !== "asFiled");

/** True when the timestamp names a real moment: Date rolls 2026-02-30 over to March, so compare the round trip. */
function isRealTimestamp(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().replace(".000Z", "Z") === s;
}

/** The validated corrections from `corrections.json`'s parsed text; a missing file is `undefined`. */
export function parseCorrections(json: unknown): Correction[] {
  if (json === undefined) return [];
  const list = (json as { corrections?: unknown } | null)?.corrections;
  if (!Array.isArray(list)) throw new Error('corrections.json: expected { "corrections": [...] }');
  return list.map((item, i): Correction => {
    const at = `corrections.json entry ${i + 1}`;
    if (typeof item !== "object" || item === null) throw new Error(`${at}: expected an object`);
    const rec = item as Record<string, unknown>;
    for (const k of KEYS) {
      if (typeof rec[k] !== "string") throw new Error(`${at}: "${k}" must be a string`);
    }
    for (const k of REQUIRED) {
      if ((rec[k] as string).trim() === "") throw new Error(`${at}: "${k}" must be a non-empty string`);
    }
    for (const k of Object.keys(rec)) {
      if (!(KEYS as readonly string[]).includes(k)) throw new Error(`${at}: unknown key "${k}"`);
    }
    if (rec.decidedBy !== "agent" && rec.decidedBy !== "human") {
      throw new Error(`${at}: "decidedBy" must be "agent" or "human"`);
    }
    const at8601 = rec.decidedAt as string;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(at8601) || !isRealTimestamp(at8601)) {
      throw new Error(`${at}: "decidedAt" must be a UTC timestamp like 2026-11-01T13:15:55Z`);
    }
    const allowed = [...CORRECTABLE_FIELDS, LOCALITY_FIELD];
    if (!allowed.includes(rec.field as string)) {
      throw new Error(`${at}: "${rec.field}" cannot be corrected here; allowed: ${allowed.join(", ")}`);
    }
    if (rec.field === LOCALITY_FIELD) {
      if (!(LOCALITIES as readonly string[]).includes(rec.correctedTo as string)) {
        throw new Error(
          `${at}: a locality correction's "correctedTo" must be one of ${LOCALITIES.join(", ")}`,
        );
      }
      if (![...LOCALITIES, "unknown"].includes(rec.asFiled as string)) {
        throw new Error(
          `${at}: a locality correction's "asFiled" must be one of ${LOCALITIES.join(", ")}, unknown`,
        );
      }
    }
    return Object.fromEntries(KEYS.map((k) => [k, rec[k]])) as Correction;
  });
}

/**
 * The one row a correction names, from its filing's rows (undefined when no filing has its path). Throws
 * when the filing is missing, no row has the Tran_ID, or more than one does.
 */
function correctedRow<R>(
  at: string,
  rows: R[] | undefined,
  tranIdOfRow: (r: R, i: number) => string,
  tranId: string,
): R {
  if (!rows) throw new Error(`${at}: no such filing`);
  const hits = rows.filter((r, i) => tranIdOfRow(r, i) === tranId);
  if (hits.length === 0) throw new Error(`${at}: no row with that Tran_ID in the filing`);
  if (hits.length > 1) throw new Error(`${at}: more than one row has that Tran_ID`);
  return hits[0];
}

/**
 * The filings' records with each correction applied to a copy; the input is left as it was. Throws when a
 * correction's filing or row is missing, its field is not a column of that filing, or the row no longer
 * holds the `asFiled` value. Logs one line per applied correction.
 */
export function applyCorrections(
  filings: FilingRecords[],
  corrections: Correction[],
  log: string[],
): FilingRecords[] {
  const out = filings.map((f) => ({ path: f.path, records: f.records.map((r) => ({ ...r })) }));
  for (const c of corrections) {
    if (c.field === LOCALITY_FIELD) continue; // not a column; applyLocalityOverrides handles it
    const at = `correction ${c.filing} ${c.tranId} ${c.field}`;
    const records = out.find((f) => f.path === c.filing)?.records;
    const row = correctedRow(at, records, (r, i) => tranIdOf(c.filing, r, i), c.tranId);
    if (!Object.hasOwn(row, c.field)) throw new Error(`${at}: "${c.field}" is not a column of the filing`);
    // A blank asFiled means the field was empty, exactly; any text, even spaces, is a changed row.
    const stale = c.asFiled === "" ? row[c.field] !== "" : row[c.field].trim() !== c.asFiled;
    if (stale) {
      throw new Error(`${at}: the row no longer reads "${c.asFiled}" (stale correction)`);
    }
    row[c.field] = c.correctedTo;
    log.push(`correction applied: ${c.filing} ${c.tranId} ${c.field} "${c.asFiled}" -> "${c.correctedTo}"`);
  }
  return out;
}

/**
 * The filings with each locality correction set on its row (copies; the input is left as it was). Throws
 * when the filing or row is missing, or the row's derived locality is not the correction's `asFiled`.
 */
export function applyLocalityOverrides(
  filings: LoadedFiling[],
  corrections: Correction[],
  countyZips: Set<string>,
  log: string[],
): LoadedFiling[] {
  const out = filings.map((f) => ({ ...f, rows: f.rows.map((r): CalRow => ({ ...r })) }));
  for (const c of corrections) {
    if (c.field !== LOCALITY_FIELD) continue;
    const at = `correction ${c.filing} ${c.tranId} ${c.field}`;
    const rows = out.find((f) => f.entry.path === c.filing)?.rows;
    const row = correctedRow(at, rows, (r) => r.tranId, c.tranId);
    if (row.localityOverride) throw new Error(`${at}: the row already has a locality correction`);
    const derived = locality(row.zip5, countyZips) ?? "unknown";
    if (derived !== c.asFiled) {
      throw new Error(`${at}: the row's locality is "${derived}", not "${c.asFiled}" (stale correction)`);
    }
    row.localityOverride = c.correctedTo as CalRow["localityOverride"];
    log.push(`correction applied: ${c.filing} ${c.tranId} ${c.field} "${c.asFiled}" -> "${c.correctedTo}"`);
  }
  return out;
}

// Transcription corrections: hand-kept decisions to read a filing's field differently from how the filer
// wrote it. Applied as an overlay on the rows read from raw data, before any counting rule runs; the raw
// files are never written. A correction that no longer fits its row stops the ingest rather than apply
// silently. Pure: the CLI does the file I/O. Erasable TypeScript only so Node can run it with type stripping.
import type { Correction } from "../elections/types.ts";
import { tranIdOf } from "./raw.ts";

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

/** Columns that identify a contributor; a correction there would put a name in the log and finance.json. */
const IDENTIFYING = new Set(["Entity_Nam L", "Entity_Nam F", "Entity_Emp", "Entity_Occ"]);

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
      if (typeof rec[k] !== "string" || (rec[k] as string).trim() === "") {
        throw new Error(`${at}: "${k}" must be a non-empty string`);
      }
    }
    for (const k of Object.keys(rec)) {
      if (!(KEYS as readonly string[]).includes(k)) throw new Error(`${at}: unknown key "${k}"`);
    }
    if (rec.decidedBy !== "agent" && rec.decidedBy !== "human") {
      throw new Error(`${at}: "decidedBy" must be "agent" or "human"`);
    }
    const at8601 = rec.decidedAt as string;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(at8601) || Number.isNaN(Date.parse(at8601))) {
      throw new Error(`${at}: "decidedAt" must be a UTC timestamp like 2026-11-01T13:15:55Z`);
    }
    if (IDENTIFYING.has(rec.field as string)) {
      throw new Error(`${at}: "${rec.field}" identifies a contributor and cannot be corrected here`);
    }
    return Object.fromEntries(KEYS.map((k) => [k, rec[k]])) as Correction;
  });
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
    const at = `correction ${c.filing} ${c.tranId} ${c.field}`;
    const filing = out.find((f) => f.path === c.filing);
    if (!filing) throw new Error(`${at}: no such filing`);
    const hits = filing.records.filter((r, i) => tranIdOf(filing.path, r, i) === c.tranId);
    if (hits.length === 0) throw new Error(`${at}: no row with that Tran_ID in the filing`);
    if (hits.length > 1) throw new Error(`${at}: more than one row has that Tran_ID`);
    const row = hits[0];
    if (!Object.hasOwn(row, c.field)) throw new Error(`${at}: "${c.field}" is not a column of the filing`);
    if (row[c.field].trim() !== c.asFiled) {
      throw new Error(`${at}: the row no longer reads "${c.asFiled}" (stale correction)`);
    }
    row[c.field] = c.correctedTo;
    log.push(`correction applied: ${c.filing} ${c.tranId} ${c.field} "${c.asFiled}" -> "${c.correctedTo}"`);
  }
  return out;
}

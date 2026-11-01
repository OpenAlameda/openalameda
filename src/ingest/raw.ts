// Pure readers for City of Alameda campaign-finance exports: the collection
// manifest, CAL-format rows (efile .xls converted to TSV, or transcribed paper
// filings) and paper summary pages. No file I/O; callers read the files.
// Erasable TypeScript only so Node can run it with native type stripping.

export type ManifestEntry = {
  path: string;
  filer: string;
  form: string;
  family: string;
  amendment: number;
  filed: string;
  period: { from: string; thru: string } | null;
  note: string;
};

export type CalRow = {
  file: string;
  filerKey: string;
  filerId: string | null;
  filerName: string;
  recType: string;
  formType: string;
  tranId: string;
  entityCd: string;
  entityLast: string;
  entityFirst: string;
  zip5: string | null;
  /** Set by a locality correction: counts the row in this locality whatever its ZIP says. */
  localityOverride?: "alameda" | "county" | "other";
  tranDate: string | null;
  thruDate: string | null;
  cents: number;
  amtCloseCents: number | null;
  amtForgCents: number | null;
  cmteId: string;
  expnCode: string;
  description: string;
  candLast: string;
  candFirst: string;
  balName: string;
  balNum: string;
  supOpp: string;
  memo: boolean;
  source: "efile" | "paper";
};

export type SummaryLine = {
  line: number;
  label: string;
  colACents: number | null;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?![\d])/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d])/;
const PERIOD = /(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/;

const pad = (n: number | string, width: number) => String(n).padStart(width, "0");

/** ISO `YYYY-MM-DD` from ISO, `M/D/YYYY` (a time suffix is ignored) or a bare Excel serial. */
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const iso = ISO_DATE.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = US_DATE.exec(s);
  if (us) return `${us[3]}-${pad(us[1], 2)}-${pad(us[2], 2)}`;
  if (/^\d{1,6}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial < 1) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
  }
  return null;
}

/** Whole cents from a dollar string such as `1,250.00`; null when blank or not a number. */
export function toCents(v: string): number | null {
  let s = v.trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -Math.abs(cents) : cents;
}

/** Filer key: the numeric `Filer_ID`, else `name:<filer name>`. */
export function filerKey(id: string, name: string): string {
  const trimmed = id.trim();
  return /^\d+$/.test(trimmed) ? trimmed : `name:${name.trim()}`;
}

/** A `Memo_Code` marks a memo row unless it is empty, `NO` or `N`. */
export function isMemo(code: string): boolean {
  const c = code.trim().toUpperCase();
  return !(c === "" || c === "NO" || c === "N");
}

export function parseManifest(text: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = line.split("\t").map((x) => x.trim());
    if (c.length < 3) continue;
    const [path, filer, form, amendment = "", filed = "", period = "", note = ""] = c;
    const range = PERIOD.exec(period);
    entries.push({
      path,
      filer,
      form,
      family: form.replace(/-A$/, ""),
      amendment: Number.parseInt(amendment, 10) || 0,
      filed: normalizeDate(filed) ?? "",
      period: range ? { from: normalizeDate(range[1]) ?? "", thru: normalizeDate(range[2]) ?? "" } : null,
      note,
    });
  }
  return entries;
}

/** Header-keyed records from a TSV; short rows read as empty, blank lines are skipped. */
export function parseTsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const header = lines.shift()?.split("\t");
  if (!header) return [];
  const records: Record<string, string>[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = cells[i] ?? "";
    });
    records.push(rec);
  }
  return records;
}

function zip5(v: string): string | null {
  const head = v.trim().slice(0, 5);
  return /^\d{5}$/.test(head) ? head : null;
}

function stemOf(file: string): string {
  const base = file.split("/").pop() ?? file;
  return base.replace(/\.[^.]+$/, "");
}

/** A row's `Tran_ID`, or `<file stem>-<row number>` when the filing leaves it blank. */
export function tranIdOf(file: string, record: Record<string, string>, index: number): string {
  return (record["Tran_ID"] ?? "").trim() || `${stemOf(file)}-${index + 1}`;
}

/** Maps CAL-named records to CalRows; a missing column reads as empty (transcribed filings omit some). */
export function toCalRows(
  file: string,
  records: Record<string, string>[],
  source: "efile" | "paper",
): CalRow[] {
  return records.map((r, i) => {
    const get = (...names: string[]) => {
      for (const n of names) {
        const v = r[n];
        if (v !== undefined && v.trim() !== "") return v.trim();
      }
      return "";
    };
    const id = get("Filer_ID");
    const name = get("Filer_Nam L");
    const form = get("Form_Type");
    return {
      file,
      filerKey: filerKey(id, name),
      filerId: /^\d+$/.test(id) ? id : null,
      filerName: name,
      recType: get("Rec_Type"),
      formType: form === "496" ? "F496" : form,
      tranId: tranIdOf(file, r, i),
      entityCd: get("Entity_Cd"),
      entityLast: get("Entity_Nam L"),
      entityFirst: get("Entity_Nam F"),
      zip5: zip5(get("Entity_ZIP4")),
      tranDate: normalizeDate(get("Tran_Date")),
      thruDate: normalizeDate(get("Thru_Date")),
      cents: toCents(get("Amount")) ?? 0,
      amtCloseCents: toCents(get("Amt_Close")),
      amtForgCents: toCents(get("Amt_Forg")),
      cmteId: get("Cmte_ID"),
      expnCode: get("Expn_Code"),
      description: get("Description"),
      candLast: get("Cand_Nam L", "Cand_Nam"),
      candFirst: get("Cand_Nam F"),
      balName: get("Bal_Name"),
      balNum: get("Bal_Num"),
      supOpp: get("Sup_Opp_Cd"),
      memo: isMemo(get("Memo_Code")),
      source,
    };
  });
}

/** Numbered lines of a paper filing's summary page; rows like `Sched A total` are skipped. */
export function parseSummary(text: string): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const rec of parseTsv(text)) {
    const n = rec["Line"]?.trim() ?? "";
    if (!/^\d+$/.test(n)) continue;
    out.push({
      line: Number(n),
      label: (rec["Label"] ?? "").trim(),
      colACents: toCents(rec["Col_A_This_Period"] ?? ""),
    });
  }
  return out;
}

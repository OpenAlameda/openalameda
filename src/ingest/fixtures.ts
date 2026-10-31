// Test builders for ingest rows and filings. Contributor names here are made up.
import type { CalRow, ManifestEntry, SummaryLine } from "./raw.ts";
import type { LoadedFiling } from "./select.ts";

export function row(overrides: Partial<CalRow> = {}): CalRow {
  return {
    file: "testperson-460-a0-2026-09-24.xls",
    filerKey: "1000001",
    filerId: "1000001",
    filerName: "Testperson for Council 2026",
    recType: "RCPT",
    formType: "A",
    tranId: "T1",
    entityCd: "IND",
    entityLast: "Testperson",
    entityFirst: "Pat",
    zip5: "94501",
    tranDate: "2026-08-01",
    thruDate: "2026-09-19",
    cents: 10000,
    amtCloseCents: null,
    amtForgCents: null,
    cmteId: "",
    expnCode: "",
    description: "",
    candLast: "",
    candFirst: "",
    balName: "",
    balNum: "",
    supOpp: "",
    memo: false,
    source: "efile",
    ...overrides,
  };
}

export function manifestEntry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    path: "testperson-460-a0-2026-09-24.xls",
    filer: "Testperson for Council 2026",
    form: "460",
    family: "460",
    amendment: 0,
    filed: "2026-09-24",
    period: { from: "2026-07-01", thru: "2026-09-19" },
    note: "",
    ...overrides,
  };
}

/** A loaded filing; the filer key and name default to the first row's, else the fixture filer. */
export function loaded(
  entry: Partial<ManifestEntry>,
  rows: CalRow[] = [],
  summary: SummaryLine[] | null = null,
): LoadedFiling {
  const e = manifestEntry(entry);
  return {
    entry: e,
    filerKey: rows[0]?.filerKey ?? "1000001",
    filerName: rows[0]?.filerName ?? e.filer,
    rows: rows.map((r) => ({ ...r, file: e.path })),
    summary,
  };
}

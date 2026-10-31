import { describe, expect, test } from "vitest";
import {
  filerKey,
  isMemo,
  normalizeDate,
  parseManifest,
  parseSummary,
  parseTsv,
  toCalRows,
  toCents,
} from "./raw.ts";

const manifest = [
  "testperson-460-a1-2026-09-24.xls\tTestperson for Mayor 2026\t460-A\t1\t9/24/2026\t7/1/2026 - 9/19/2026\t12",
  "testperson-497-a0-2026-10-21.xls\tTestperson for Mayor 2026\t497\t0\t10/21/2026\t-\t3",
  "paper-not-downloaded\tPat Committee\t460\t\t10/22/2026\t1/1/2026-12/31/2026\t",
].join("\n");

describe("parseManifest", () => {
  test("reads form family, amendment, ISO dates and periods", () => {
    const rows = parseManifest(manifest);
    expect(rows.map((r) => r.family)).toEqual(["460", "497", "460"]);
    expect(rows[0]).toMatchObject({
      path: "testperson-460-a1-2026-09-24.xls",
      filer: "Testperson for Mayor 2026",
      form: "460-A",
      amendment: 1,
      filed: "2026-09-24",
      period: { from: "2026-07-01", thru: "2026-09-19" },
      note: "12",
    });
    expect(rows[1].period).toBeNull();
  });

  test("tolerates an empty amendment and a period without spaces", () => {
    const row = parseManifest(manifest)[2];
    expect(row.path).toBe("paper-not-downloaded");
    expect(row.amendment).toBe(0);
    expect(row.period).toEqual({ from: "2026-01-01", thru: "2026-12-31" });
  });

  test("keeps the first range when the period has a trailing note", () => {
    const [row] = parseManifest(
      "x.pdf\tPat\tpdf\t0\t9/24/2026\t1/1/2026 - 9/19/2026 (cover: 7/1-9/19/2026)\t",
    );
    expect(row.period).toEqual({ from: "2026-01-01", thru: "2026-09-19" });
  });

  test("ignores blank lines and short rows", () => {
    expect(parseManifest("\n\nx.xls\tPat\t460\n")).toHaveLength(1);
  });
});

describe("normalizeDate", () => {
  test("accepts ISO, M/D/YYYY and Excel serials", () => {
    expect(normalizeDate("2026-10-15")).toBe("2026-10-15");
    expect(normalizeDate("10/15/2026")).toBe("2026-10-15");
    expect(normalizeDate("46310")).toBe("2026-10-15");
  });

  test("returns null for blanks and junk", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate("soon")).toBeNull();
  });
});

describe("toCents", () => {
  test("parses plain, decimal and comma amounts", () => {
    expect(toCents("500")).toBe(50000);
    expect(toCents("31095.44")).toBe(3109544);
    expect(toCents("1,250.00")).toBe(125000);
    expect(toCents("-20.10")).toBe(-2010);
  });

  test("returns null for blanks", () => {
    expect(toCents("")).toBeNull();
  });
});

describe("isMemo", () => {
  test("treats empty, NO and N as not memo", () => {
    for (const c of ["", "NO", "n"]) expect(isMemo(c)).toBe(false);
    for (const c of ["X", "Y"]) expect(isMemo(c)).toBe(true);
  });
});

describe("filerKey", () => {
  test("uses a numeric id, else the name", () => {
    expect(filerKey("1492067", "Testperson for Mayor 2026")).toBe("1492067");
    expect(filerKey("", "Thushan Committee")).toBe("name:Thushan Committee");
    expect(filerKey("Pending", "Pat Firefighters Local 1")).toBe("name:Pat Firefighters Local 1");
  });
});

describe("parseTsv", () => {
  test("reads by header name, fills short rows and skips blank lines", () => {
    const rows = parseTsv("A\tB\tC\r\n1\t2\t3\r\n\r\nx\ty\r\n");
    expect(rows).toEqual([
      { A: "1", B: "2", C: "3" },
      { A: "x", B: "y", C: "" },
    ]);
  });
});

describe("toCalRows", () => {
  const base = {
    Filer_ID: "1492067",
    "Filer_Nam L": "Testperson for Mayor 2026",
    Rec_Type: "RCPT",
    Form_Type: "A",
    Tran_ID: "INC1",
    Entity_Cd: "IND",
    "Entity_Nam L": "Testperson",
    "Entity_Nam F": "Pat",
    Tran_Date: "2026-07-01",
    Amount: "250",
    Memo_Code: "",
  };

  test("maps columns into a CalRow", () => {
    const [row] = toCalRows("a.xls", [{ ...base, Entity_ZIP4: "94501-1234" }], "efile");
    expect(row).toMatchObject({
      file: "a.xls",
      filerKey: "1492067",
      filerId: "1492067",
      filerName: "Testperson for Mayor 2026",
      recType: "RCPT",
      formType: "A",
      tranId: "INC1",
      entityLast: "Testperson",
      entityFirst: "Pat",
      zip5: "94501",
      tranDate: "2026-07-01",
      thruDate: null,
      cents: 25000,
      amtCloseCents: null,
      memo: false,
      source: "efile",
    });
  });

  test("keeps the first five digits of a ZIP and drops short or empty ones", () => {
    const zips = ["94501-1234", "945011234", "9450", ""];
    const rows = toCalRows(
      "a.xls",
      zips.map((z) => ({ ...base, Entity_ZIP4: z })),
      "efile",
    );
    expect(rows.map((r) => r.zip5)).toEqual(["94501", "94501", null, null]);
  });

  test("D9: reads a transcribed 496 with missing columns", () => {
    const records = parseTsv(
      [
        "Filer_Nam L\tFiler_ID\tForm_Type\tRpt_Date\tTran_Date\tAmount\tCand_Nam\tBal_Num\tSup_Opp_Cd",
        "Pat Firefighters Local 1\tPending\t496\t2026-10-20\t2026-10-19\t9500.00\t\tL\tS",
      ].join("\n"),
    );
    const [row] = toCalRows("pat-496-10202026.tsv", records, "paper");
    expect(row).toMatchObject({
      formType: "F496",
      balNum: "L",
      supOpp: "S",
      tranId: "pat-496-10202026-1",
      filerId: null,
      filerKey: "name:Pat Firefighters Local 1",
      cents: 950000,
      recType: "",
      source: "paper",
    });
  });
});

describe("parseSummary", () => {
  test("reads numbered lines and skips schedule totals", () => {
    const text = [
      "Line\tLabel\tCol_A_This_Period\tCol_B_Calendar_YTD\tPage",
      "1\tMonetary Contributions\t1100\t1795\t03",
      "2\tLoans Received\t\t\t03",
      "Sched A total\tx\t5\t\t",
    ].join("\n");
    expect(parseSummary(text)).toEqual([
      { line: 1, label: "Monetary Contributions", colACents: 110000 },
      { line: 2, label: "Loans Received", colACents: null },
    ]);
  });
});

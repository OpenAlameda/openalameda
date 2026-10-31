import { describe, expect, test } from "vitest";
import { loaded, row } from "./fixtures.ts";
import { belongsTo, selectFilings } from "./select.ts";

const SEPT = { from: "2026-07-01", thru: "2026-09-19" };
const OCT = { from: "2026-09-20", thru: "2026-10-17" };

const tranIds = (rows: { tranId: string }[]) => rows.map((r) => r.tranId).sort();

describe("selectFilings: latest amendment wins (rule 1, D2)", () => {
  test("a 460-A replaces its 460 for the same period, including rows only in the original", () => {
    const original = loaded(
      { path: "a0.xls", form: "460", family: "460", amendment: 0, filed: "2026-09-24", period: SEPT },
      [row({ tranId: "T1" }), row({ tranId: "GONE" })],
    );
    const amended = loaded(
      { path: "a1.xls", form: "460-A", family: "460", amendment: 1, filed: "2026-10-01", period: SEPT },
      [row({ tranId: "T1", cents: 20000 })],
    );
    const log: string[] = [];
    const sel = selectFilings([original, amended], log);
    expect(sel.period.map((f) => f.entry.path)).toEqual(["a1.xls"]);
    expect(sel.superseded.map((f) => f.entry.path)).toEqual(["a0.xls"]);
    const counted = sel.period.flatMap((f) => f.rows);
    expect(tranIds(counted)).toEqual(["T1"]);
    expect(counted[0].cents).toBe(20000);
  });

  test("the highest amendment number wins", () => {
    const a1 = loaded({
      path: "a1.xls",
      form: "460-A",
      family: "460",
      amendment: 1,
      filed: "2026-10-05",
      period: SEPT,
    });
    const a3 = loaded({
      path: "a3.xls",
      form: "460-A",
      family: "460",
      amendment: 3,
      filed: "2026-10-02",
      period: SEPT,
    });
    const sel = selectFilings([a3, a1], []);
    expect(sel.period.map((f) => f.entry.path)).toEqual(["a3.xls"]);
    expect(sel.superseded.map((f) => f.entry.path)).toEqual(["a1.xls"]);
  });

  test("a tie on amendment number goes to the later filing", () => {
    const early = loaded({
      path: "early.xls",
      form: "460-A",
      family: "460",
      amendment: 2,
      filed: "2026-10-02",
      period: SEPT,
    });
    const late = loaded({
      path: "late.xls",
      form: "460-A",
      family: "460",
      amendment: 2,
      filed: "2026-10-09",
      period: SEPT,
    });
    expect(selectFilings([late, early], []).period.map((f) => f.entry.path)).toEqual(["late.xls"]);
    expect(selectFilings([early, late], []).period.map((f) => f.entry.path)).toEqual(["late.xls"]);
  });

  test("different periods, families and filers are kept side by side (rule 4)", () => {
    const sept = loaded({ path: "sept.xls", period: SEPT });
    const oct = loaded({ path: "oct.xls", period: OCT, filed: "2026-10-22" });
    const f450 = loaded({ path: "450.xls", form: "450", family: "450", period: SEPT });
    const other = loaded({ path: "other.xls", period: SEPT }, [
      row({ filerKey: "1000002", filerId: "1000002" }),
    ]);
    const sel = selectFilings([sept, oct, f450, other], []);
    expect(sel.period.map((f) => f.entry.path).sort()).toEqual([
      "450.xls",
      "oct.xls",
      "other.xls",
      "sept.xls",
    ]);
    expect(sel.superseded).toEqual([]);
  });

  test("records each filer's latest period thru date across families", () => {
    const sept = loaded({ path: "sept.xls", period: SEPT });
    const oct = loaded({ path: "oct.xls", form: "450", family: "450", period: OCT });
    const sel = selectFilings([sept, oct], []);
    expect(sel.latestThru.get("1000001")).toBe("2026-10-17");
  });

  test("logs rows whose Thru_Date disagrees with the manifest period", () => {
    const log: string[] = [];
    selectFilings([loaded({ path: "sept.xls", period: SEPT }, [row({ thruDate: "2026-09-30" })])], log);
    expect(log.some((l) => l.includes("sept.xls") && l.includes("2026-09-30"))).toBe(true);
  });
});

describe("selectFilings: late reports (rule 2, D5)", () => {
  const sept = loaded({ path: "sept.xls", period: SEPT }, [row({ tranId: "P1" })]);
  const late497 = (path: string, filed: string, rows: ReturnType<typeof row>[]) =>
    loaded({ path, form: "497", family: "497", filed, period: null }, rows);

  test("a 497 dated on the latest thru date is not counted; the day after is", () => {
    const f = late497("497.xls", "2026-09-25", [
      row({ formType: "F497P1", tranId: "ON", tranDate: "2026-09-19", thruDate: null }),
      row({ formType: "F497P1", tranId: "AFTER", tranDate: "2026-09-20", thruDate: null }),
    ]);
    const sel = selectFilings([sept, f], []);
    expect(tranIds(sel.late)).toEqual(["AFTER"]);
  });

  test("a filer with no period report has all its late rows counted", () => {
    const f = late497("497.xls", "2026-09-25", [
      row({
        filerKey: "1000009",
        filerId: "1000009",
        formType: "F497P1",
        tranId: "EARLY",
        tranDate: "2026-01-05",
      }),
    ]);
    expect(tranIds(selectFilings([sept, f], []).late)).toEqual(["EARLY"]);
  });

  test("the same Tran_ID in two 497 files counts once, from the later-filed file", () => {
    const first = late497("first.xls", "2026-10-01", [
      row({ formType: "F497P1", tranId: "DUP", tranDate: "2026-09-30", cents: 50000 }),
    ]);
    const second = late497("second.xls", "2026-10-03", [
      row({ formType: "F497P1", tranId: "DUP", tranDate: "2026-09-30", cents: 60000 }),
    ]);
    for (const order of [
      [first, second],
      [second, first],
    ]) {
      const sel = selectFilings([sept, ...order], []);
      expect(sel.late).toHaveLength(1);
      expect(sel.late[0]).toMatchObject({ file: "second.xls", cents: 60000 });
    }
  });

  test("keeps F496 rows and drops F497P2 and memo rows", () => {
    const f496 = loaded({ path: "496.xls", form: "496", family: "496", filed: "2026-10-20", period: null }, [
      row({ formType: "F496", tranId: "IE", tranDate: "2026-10-19" }),
      row({ formType: "F496P3", tranId: "P3", tranDate: "2026-10-19" }),
    ]);
    const f497 = late497("497.xls", "2026-10-20", [
      row({ formType: "F497P2", tranId: "MADE", tranDate: "2026-10-19" }),
      row({ formType: "F497P1", tranId: "MEMO", tranDate: "2026-10-19", memo: true }),
    ]);
    expect(tranIds(selectFilings([sept, f496, f497], []).late)).toEqual(["IE"]);
  });

  test("an amended period report sets the late-report boundary like the original", () => {
    const a0 = loaded({ path: "oct-a0.xls", period: OCT, filed: "2026-10-22" });
    const a1 = loaded({ path: "oct-a1.xls", form: "460-A", amendment: 1, period: OCT, filed: "2026-10-25" });
    const f = late497("497.xls", "2026-10-26", [
      row({ formType: "F497P1", tranId: "X", tranDate: "2026-10-18" }),
    ]);
    const sel = selectFilings([sept, a0, a1, f], []);
    expect(sel.latestThru.get("1000001")).toBe("2026-10-17");
    expect(tranIds(sel.late)).toEqual(["X"]);
  });
});

describe("belongsTo (D3)", () => {
  const committee = { id: "1492067", name: "Testperson for Mayor 2026", aliases: ["Testperson Mayor 2026"] };

  test("matches a numeric filer key by id, not by name", () => {
    expect(belongsTo(committee, "1492067", "Anything at all")).toBe(true);
    expect(belongsTo(committee, "1492068", "Testperson for Mayor 2026")).toBe(false);
  });

  test("matches a filer without a numeric id by exact name", () => {
    expect(belongsTo(committee, "name:Testperson for Mayor 2026", "Testperson for Mayor 2026")).toBe(true);
    expect(belongsTo(committee, "name:testperson for mayor 2026", "testperson for mayor 2026")).toBe(false);
  });

  test("matches a filer without a numeric id by alias", () => {
    expect(belongsTo(committee, "name:Testperson Mayor 2026", "Testperson Mayor 2026")).toBe(true);
  });

  test("falls back to the name when the committee has no id on file", () => {
    const noId = { id: null, name: "Testperson for Council 2026" };
    expect(belongsTo(noId, "1000001", "Testperson for Council 2026")).toBe(true);
    expect(belongsTo(noId, "1000001", "Someone Else 2026")).toBe(false);
  });
});

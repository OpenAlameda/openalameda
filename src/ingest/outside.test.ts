import { describe, expect, test } from "vitest";
import type { RacesFile } from "../elections/types.ts";
import { loaded, row } from "./fixtures.ts";
import { outsideSpending, type Attribution } from "./outside.ts";
import { selectFilings } from "./select.ts";
import type { LoadedFiling } from "./select.ts";

const RACES: RacesFile = {
  election: "2026-11-03-general",
  races: [
    {
      kind: "office",
      slug: "school-board",
      name: "School Board",
      seats: 2,
      links: {},
      candidates: [
        {
          slug: "carrie-hahnel",
          ballotName: "Carrie Hahnel",
          legalName: "Hahnel, Carrie",
          committees: [{ id: "1491388", name: "Carrie Hahnel for AUSD Board of Education 2026" }],
          priorCommittees: [],
        },
        {
          slug: "joyce-boyd",
          ballotName: "Joyce Boyd",
          legalName: "Boyd, Joyce",
          committees: [{ id: "1487626", name: "Joyce Boyd for School Board 2026" }],
          priorCommittees: [],
        },
      ],
    },
    {
      kind: "measure",
      slug: "measure-l",
      name: "Measure L",
      title: "Bond",
      links: {},
      sides: { yes: { committees: [] }, no: { committees: [] } },
    },
  ],
};

const PAC = { filerKey: "890076", filerId: "890076", filerName: "Test PAC" };
const SEPT = { from: "2026-07-01", thru: "2026-09-19" };

/** A PAC 460 through 9/19 carrying the given Schedule D rows. */
const pac460 = (rows = [row({ ...PAC, formType: "D", tranId: "D0", expnCode: "MON" })]) =>
  loaded({ path: "pac-460.xls", filer: PAC.filerName, period: SEPT, filed: "2026-09-24" }, rows);

const pac496 = (rows: ReturnType<typeof row>[], path = "pac-496.xls") =>
  loaded({ path, filer: PAC.filerName, form: "496", family: "496", period: null, filed: "2026-10-27" }, rows);

function run(filings: LoadedFiling[], attributions: Record<string, Attribution> = {}) {
  const log: string[] = [];
  const selection = selectFilings(filings, log);
  return { ...outsideSpending({ selection, races: RACES, attributions }, log), log };
}

const dRow = (o: Partial<ReturnType<typeof row>>) =>
  row({ ...PAC, recType: "EXPN", formType: "D", expnCode: "IND", entityCd: "COM", ...o });
const f496 = (o: Partial<ReturnType<typeof row>>) =>
  row({ ...PAC, recType: "S496", formType: "F496", entityCd: "", tranDate: "2026-10-26", ...o });

describe("outsideSpending: Schedule D (D7)", () => {
  test("an IND row naming a candidate, with extra spaces, supports that candidate", () => {
    const { groups, unmatched } = run([
      pac460([dRow({ tranId: "D1", candLast: "Carrie  Hahnel", supOpp: "S", cents: 120000 })]),
    ]);
    expect(unmatched).toEqual([]);
    expect(groups).toEqual([
      {
        key: "890076",
        name: "Test PAC",
        totals: [{ target: "school-board/carrie-hahnel", side: "support", cents: 120000 }],
      },
    ]);
  });

  test("last and first name columns match the ballot name too", () => {
    const { groups } = run([
      pac460([dRow({ tranId: "D1", candLast: "Hahnel", candFirst: "Carrie", supOpp: "O", cents: 500 })]),
    ]);
    expect(groups[0].totals).toEqual([{ target: "school-board/carrie-hahnel", side: "oppose", cents: 500 }]);
  });

  test("an IND row opposing ballot measure L counts against the Yes side", () => {
    const { groups } = run([pac460([dRow({ tranId: "D2", balNum: "L", supOpp: "O", cents: 7000 })])]);
    expect(groups[0].totals).toEqual([{ target: "measure-l/yes", side: "oppose", cents: 7000 }]);
  });

  test("a MON row is a direct contribution, not outside spending", () => {
    const { groups, unmatched } = run([
      pac460([dRow({ tranId: "D3", expnCode: "MON", candLast: "Carrie Hahnel", supOpp: "S" })]),
    ]);
    expect(groups).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  test("an IND row naming nobody on the ballot is unmatched", () => {
    const { groups, unmatched } = run([
      pac460([dRow({ tranId: "D4", balNum: "50", balName: "A State Measure", supOpp: "S", cents: 9900 })]),
    ]);
    expect(groups).toEqual([]);
    expect(unmatched).toEqual([
      expect.objectContaining({
        filerKey: "890076",
        filer: "Test PAC",
        tranId: "D4",
        formType: "D",
        cents: 9900,
      }),
    ]);
  });

  test("a candidate committee's own IND row about its own candidate is not outside spending", () => {
    const own = row({
      filerKey: "1491388",
      filerId: "1491388",
      filerName: "Carrie Hahnel for AUSD Board of Education 2026",
    });
    const filing = loaded({ path: "hahnel-460.xls", period: SEPT }, [
      row({ ...own, formType: "D", expnCode: "IND", tranId: "D5", candLast: "Carrie Hahnel", supOpp: "S" }),
    ]);
    const { groups, unmatched } = run([filing]);
    expect(groups).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  test("memo D rows do not count", () => {
    const { groups } = run([
      pac460([dRow({ tranId: "D6", candLast: "Carrie Hahnel", supOpp: "S", memo: true })]),
    ]);
    expect(groups).toEqual([]);
  });
});

describe("outsideSpending: 496 rows (D5, D8)", () => {
  test("two targets without cents split 1001 cents as 501 and 500", () => {
    const { groups } = run([pac460(), pac496([f496({ tranId: "E1", cents: 1001 })])], {
      "890076:E1": {
        targets: [
          { target: "school-board/carrie-hahnel", side: "support" },
          { target: "school-board/joyce-boyd", side: "support" },
        ],
        why: "mailer for two candidates",
      },
    });
    expect(groups[0].totals).toEqual([
      { target: "school-board/carrie-hahnel", side: "support", cents: 501 },
      { target: "school-board/joyce-boyd", side: "support", cents: 500 },
    ]);
  });

  test("targets with cents use them", () => {
    const { groups } = run([pac496([f496({ tranId: "E1", cents: 1000 })])], {
      "890076:E1": {
        targets: [
          { target: "school-board/carrie-hahnel", side: "support", cents: 700 },
          { target: "school-board/joyce-boyd", side: "oppose", cents: 300 },
        ],
        why: "split stated on the filing",
      },
    });
    expect(groups[0].totals).toEqual([
      { target: "school-board/carrie-hahnel", side: "support", cents: 700 },
      { target: "school-board/joyce-boyd", side: "oppose", cents: 300 },
    ]);
  });

  test("a 496 row dated on or before the spender's latest thru is not counted (rule 2)", () => {
    const { groups, unmatched } = run([pac460(), pac496([f496({ tranId: "E2", tranDate: "2026-09-19" })])], {
      "890076:E2": { targets: [{ target: "school-board/carrie-hahnel", side: "support" }], why: "x" },
    });
    expect(groups).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  test("a counted 496 row without an attribution is unmatched, with its description", () => {
    const { groups, unmatched, log } = run([
      pac460(),
      pac496([f496({ tranId: "E3", cents: 46000, description: "Mailer" })]),
    ]);
    expect(groups).toEqual([]);
    expect(unmatched).toEqual([
      {
        filerKey: "890076",
        filer: "Test PAC",
        tranId: "E3",
        formType: "F496",
        date: "2026-10-26",
        cents: 46000,
        description: "Mailer",
      },
    ]);
    expect(log.some((l) => l.includes("E3") && l.includes("Mailer"))).toBe(true);
  });

  test("a notLocal attribution puts the row in neither list", () => {
    const { groups, unmatched, log } = run([pac496([f496({ tranId: "E4" })])], {
      "890076:E4": { notLocal: "a state race" },
    });
    expect(groups).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(log.some((l) => l.includes("E4") && l.includes("a state race"))).toBe(true);
  });

  test("a 496 row that carries a ballot measure number matches like a D row", () => {
    const { groups } = run([pac496([f496({ tranId: "E5", balNum: "L", supOpp: "S", cents: 950000 })])]);
    expect(groups[0].totals).toEqual([{ target: "measure-l/yes", side: "support", cents: 950000 }]);
  });

  test("an attribution overrides D7 matching on a D row", () => {
    const { groups } = run(
      [pac460([dRow({ tranId: "D7", candLast: "Carrie Hahnel", supOpp: "S", cents: 100 })])],
      { "890076:D7": { targets: [{ target: "school-board/joyce-boyd", side: "oppose" }], why: "x" } },
    );
    expect(groups[0].totals).toEqual([{ target: "school-board/joyce-boyd", side: "oppose", cents: 100 }]);
  });

  test("an attribution to a target that is not on the ballot throws", () => {
    expect(() =>
      run([pac496([f496({ tranId: "E6" })])], {
        "890076:E6": { targets: [{ target: "mayor/nobody", side: "support" }], why: "x" },
      }),
    ).toThrow(/mayor\/nobody/);
  });

  test("totals add up per group, target and side, in a stable order", () => {
    const { groups } = run([
      pac460([
        dRow({ tranId: "D8", candLast: "Joyce Boyd", supOpp: "S", cents: 100 }),
        dRow({ tranId: "D9", candLast: "Carrie Hahnel", supOpp: "S", cents: 200 }),
        dRow({ tranId: "D10", candLast: "Carrie Hahnel", supOpp: "S", cents: 300 }),
      ]),
    ]);
    expect(groups[0].totals).toEqual([
      { target: "school-board/carrie-hahnel", side: "support", cents: 500 },
      { target: "school-board/joyce-boyd", side: "support", cents: 100 },
    ]);
  });
});

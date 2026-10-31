import { describe, expect, test } from "vitest";
import { BANDS, DONOR_TYPES, LOCALITIES, type Candidate, type MoneySummary } from "../elections/types.ts";
import { loaded, row } from "./fixtures.ts";
import { band, donorType, locality, namesMatch, summarize } from "./money.ts";
import type { CalRow } from "./raw.ts";
import type { LoadedFiling } from "./select.ts";

const countyZips = new Set(["94501", "94502", "94601", "94612"]);

const daysog: Candidate = {
  slug: "tony-daysog",
  ballotName: "Tony Daysog",
  legalName: "Daysog, Tony",
  committees: [{ id: "1492067", name: "Daysog for Mayor 2026" }],
  priorCommittees: [
    { id: "1404765", name: "Daysog for Council 2018" },
    { id: "1452578", name: "Daysog for Council 2022" },
  ],
};

const SEPT = { from: "2026-07-01", thru: "2026-09-19" };
const OCT = { from: "2026-09-20", thru: "2026-10-17" };

function run(
  filings: LoadedFiling[],
  opts: { late?: CalRow[]; candidate?: Candidate | null } = {},
): { s: MoneySummary; log: string[] } {
  const log: string[] = [];
  const s = summarize(
    {
      filings,
      late: opts.late ?? [],
      candidate: opts.candidate === undefined ? daysog : opts.candidate,
      countyZips,
    },
    log,
  );
  return { s, log };
}

const one = (rows: CalRow[], opts: { late?: CalRow[]; candidate?: Candidate | null } = {}) =>
  run([loaded({ period: SEPT }, rows)], opts);

const sumMatrix = (s: MoneySummary) =>
  LOCALITIES.flatMap((l) => DONOR_TYPES.map((t) => s.matrix[l][t].cents)).reduce((a, b) => a + b, 0);
const sumBands = (b: Record<string, number>) => BANDS.reduce((a, k) => a + b[k], 0);

describe("locality (rule 7)", () => {
  test("Alameda ZIPs, county ZIPs, everything else, unknown", () => {
    expect(locality("94501", countyZips)).toBe("alameda");
    expect(locality("94502", countyZips)).toBe("alameda");
    expect(locality("94612", countyZips)).toBe("county");
    expect(locality("94103", countyZips)).toBe("other");
    expect(locality(null, countyZips)).toBeNull();
  });

  test("summarize counts an unknown ZIP as other and in unknownLocalityCents", () => {
    const { s } = one([row({ zip5: null, cents: 12300, entityCd: "IND" })]);
    expect(s.matrix.other.individual).toEqual({ cents: 12300, count: 1 });
    expect(s.unknownLocalityCents).toBe(12300);
  });
});

describe("donorType (rule 8)", () => {
  test("maps entity codes", () => {
    expect(donorType("IND")).toBe("individual");
    expect(donorType("OTH")).toBe("organization");
    expect(donorType("COM")).toBe("political");
    expect(donorType("PTY")).toBe("political");
    expect(donorType("SCC")).toBe("political");
    expect(donorType("XYZ")).toBe("organization");
  });

  test("summarize logs an unknown code", () => {
    const { s, log } = one([row({ entityCd: "XYZ", entityLast: "Testco", entityFirst: "" })]);
    expect(s.matrix.alameda.organization.count).toBe(1);
    expect(log.some((l) => l.includes("XYZ"))).toBe(true);
  });
});

describe("band", () => {
  test("bands by cents", () => {
    expect(band(100000)).toBe("1000+");
    expect(band(99999)).toBe("500-999");
    expect(band(50000)).toBe("500-999");
    expect(band(25000)).toBe("250-499");
    expect(band(10000)).toBe("100-249");
    expect(band(9999)).toBe("under-100");
  });
});

describe("namesMatch", () => {
  test("ignores case, punctuation and extra spaces; last and first must each be equal", () => {
    expect(namesMatch("Daysog, Tony", "DAYSOG", "Tony.")).toBe(true);
    expect(namesMatch("Daysog, Tony", "  daysog ", " tony ")).toBe(true);
    expect(namesMatch("Daysog, Tony", "Daysog", "Anne")).toBe(false);
    expect(namesMatch("Daysog, Tony", "Daysogg", "Tony")).toBe(false);
    expect(namesMatch("Daysog, Tony", "Daysog", "")).toBe(false);
  });
});

describe("summarize: counted rows (rules 3, 5; D4)", () => {
  test("memo, G and F rows are left out; E and F450P5 are spent; C and A are raised", () => {
    const { s } = one([
      row({ tranId: "A1", formType: "A", cents: 10000 }),
      row({ tranId: "A2", formType: "A", cents: 50000, memo: true }),
      row({
        tranId: "C1",
        formType: "C",
        cents: 30000,
        entityCd: "OTH",
        entityLast: "Testco",
        entityFirst: "",
        zip5: "94612",
      }),
      row({ tranId: "E1", recType: "EXPN", formType: "E", cents: 70000 }),
      row({ tranId: "E2", recType: "EXPN", formType: "E", cents: 1000, memo: true }),
      row({ tranId: "G1", recType: "EXPN", formType: "G", cents: 5000 }),
      row({ tranId: "F1", recType: "EXPN", formType: "F", cents: 9000 }),
      row({ tranId: "P5", recType: "EXPN", formType: "F450P5", cents: 2000 }),
    ]);
    expect(s.raisedCents).toBe(40000);
    expect(s.spentCents).toBe(72000);
    expect(s.matrix.county.organization).toEqual({ cents: 30000, count: 1 });
    expect(s.matrix.alameda.individual).toEqual({ cents: 10000, count: 1 });
    expect(s.contributionCount).toBe(2);
  });

  test("a counted F497P1 adds to raised; other late rows do not", () => {
    const late = [
      row({ tranId: "L1", formType: "F497P1", cents: 25000, tranDate: "2026-10-01", zip5: "94103" }),
      row({ tranId: "L2", formType: "F496", cents: 99900, tranDate: "2026-10-01" }),
    ];
    const { s } = one([row({ cents: 10000 })], { late });
    expect(s.raisedCents).toBe(35000);
    expect(s.matrix.other.individual).toEqual({ cents: 25000, count: 1 });
    expect(s.bands["250-499"]).toBe(25000);
  });

  test("status and paper", () => {
    expect(run([]).s.status).toBe("no-filings");
    expect(
      run([], { candidate: { ...daysog, shortForm: { form: "470-C", filed: "2026-08-01" } } }).s.status,
    ).toBe("short-form");
    expect(one([row()]).s).toMatchObject({ status: "filed", paper: false });
    expect(one([row({ source: "paper" })]).s.paper).toBe(true);
  });
});

describe("summarize: own money and carried over (rule 11)", () => {
  test("the candidate's own contribution is own money, in raised, out of the heatmap and bands", () => {
    const { s, log } = one([
      row({ tranId: "OWN", entityCd: "IND", entityLast: "DAYSOG", entityFirst: "Tony.", cents: 500000 }),
      row({ tranId: "X", cents: 10000 }),
    ]);
    expect(s.ownCents).toBe(500000);
    expect(s.raisedCents).toBe(510000);
    expect(sumMatrix(s)).toBe(10000);
    expect(sumBands(s.bands)).toBe(10000);
    expect(s.bands["1000+"]).toBe(0);
    expect(s.contributionCount).toBe(1);
    expect(log.some((l) => l.includes("own money"))).toBe(true);
  });

  test("a near miss on the name is not own money and is logged", () => {
    const { s, log } = one([row({ entityLast: "Daysog", entityFirst: "Anne", cents: 20000 })]);
    expect(s.ownCents).toBe(0);
    expect(s.matrix.alameda.individual.cents).toBe(20000);
    expect(log.some((l) => l.includes("near miss"))).toBe(true);
  });

  test("money from a prior committee, by Cmte_ID or by exact name, is carried over", () => {
    const { s } = one([
      row({
        tranId: "BYID",
        entityCd: "COM",
        entityLast: "Some Old Name",
        entityFirst: "",
        cmteId: "1452578",
        cents: 300000,
      }),
      row({
        tranId: "BYNAME",
        entityCd: "COM",
        entityLast: " Daysog  for Council 2022 ",
        entityFirst: "",
        cents: 40000,
      }),
      row({
        tranId: "NOT",
        entityCd: "COM",
        entityLast: "Daysog for Council 2022 PAC",
        entityFirst: "",
        cents: 15000,
      }),
    ]);
    expect(s.carriedCents).toBe(340000);
    expect(s.raisedCents).toBe(355000);
    expect(s.matrix.alameda.political).toEqual({ cents: 15000, count: 1 });
    expect(sumBands(s.bands)).toBe(15000);
  });

  test("a measure side (no candidate) has no own or carried money", () => {
    const { s } = one(
      [
        row({ entityLast: "Daysog", entityFirst: "Tony", cents: 10000 }),
        row({
          entityCd: "COM",
          entityLast: "Daysog for Council 2022",
          entityFirst: "",
          cmteId: "1452578",
          cents: 20000,
        }),
      ],
      { candidate: null },
    );
    expect(s.ownCents).toBe(0);
    expect(s.carriedCents).toBe(0);
    expect(sumMatrix(s)).toBe(30000);
  });
});

describe("summarize: loans (D6)", () => {
  const b1 = (o: Partial<CalRow>) => row({ recType: "LOAN", formType: "B1", ...o });

  test("outstanding loans come from each committee's latest period report only", () => {
    const sept = loaded({ path: "sept.xls", period: SEPT }, [
      b1({ tranId: "L1", entityLast: "Daysog", entityFirst: "Tony", cents: 100000, amtCloseCents: 100000 }),
    ]);
    const oct = loaded({ path: "oct.xls", period: OCT, filed: "2026-10-22" }, [
      b1({
        tranId: "L1",
        entityLast: "Daysog",
        entityFirst: "Tony",
        cents: 0,
        amtCloseCents: 80000,
        amtForgCents: 50000,
      }),
      b1({ tranId: "L2", entityLast: "Daysog", entityFirst: "Tony", cents: 30000, amtCloseCents: null }),
      b1({
        tranId: "L3",
        entityCd: "OTH",
        entityLast: "Testbank",
        entityFirst: "",
        cents: 60000,
        amtCloseCents: 45000,
      }),
    ]);
    const { s } = run([oct, sept]);
    expect(s.loansFromCandidateCents).toBe(110000);
    expect(s.otherLoansCents).toBe(45000);
    expect(s.ownCents).toBe(50000);
    expect(s.raisedCents).toBe(50000);
    expect(sumMatrix(s)).toBe(0);
  });

  test("forgiven candidate loans add up over every included report", () => {
    const sept = loaded({ path: "sept.xls", period: SEPT }, [
      b1({ entityLast: "Daysog", entityFirst: "Tony", amtCloseCents: 0, amtForgCents: 20000 }),
    ]);
    const oct = loaded({ path: "oct.xls", period: OCT }, [
      b1({ entityLast: "Daysog", entityFirst: "Tony", amtCloseCents: 0, amtForgCents: 50000 }),
    ]);
    const { s } = run([sept, oct]);
    expect(s.ownCents).toBe(70000);
    expect(s.raisedCents).toBe(70000);
  });
});

describe("summarize: negative contributions (D11)", () => {
  test("reduce raised and the cell's cents, not bands or counts, and are logged", () => {
    const { s, log } = one([row({ tranId: "P", cents: 50000 }), row({ tranId: "N", cents: -25000 })]);
    expect(s.raisedCents).toBe(25000);
    expect(s.matrix.alameda.individual).toEqual({ cents: 25000, count: 1 });
    expect(s.bands).toMatchObject({ "500-999": 50000, "250-499": 0 });
    expect(s.contributionCount).toBe(1);
    expect(log.some((l) => l.includes("negative"))).toBe(true);
  });
});

describe("summarize: paper summary check (D12)", () => {
  const summary = [
    { line: 1, label: "Monetary Contributions", colACents: 10000 },
    { line: 2, label: "Loans Received", colACents: 0 },
    { line: 4, label: "Nonmonetary Contributions", colACents: 200000 },
    { line: 6, label: "Payments Made", colACents: 3109544 },
    { line: 10, label: "Nonmonetary Adjustment", colACents: null },
  ];
  const rows = [
    row({ formType: "A", cents: 10000, source: "paper" }),
    row({
      formType: "C",
      cents: 200000,
      source: "paper",
      entityCd: "OTH",
      entityLast: "Testco",
      entityFirst: "",
    }),
    row({ recType: "EXPN", formType: "E", cents: 3109400, source: "paper" }),
  ];

  test("differences of $2.00 or more become reportedDiffs; smaller ones are only logged", () => {
    const log: string[] = [];
    const s = summarize(
      {
        filings: [loaded({ path: "paper.tsv", filed: "2026-10-22", period: SEPT }, rows, summary)],
        late: [],
        candidate: daysog,
        countyZips,
      },
      log,
    );
    expect(s.reportedDiffs).toEqual([
      {
        filed: "2026-10-22",
        line: 10,
        label: "Nonmonetary Adjustment",
        reportedCents: 0,
        scheduleCents: 200000,
      },
    ]);
    expect(s.paper).toBe(true);
    expect(log.some((l) => l.includes("line 6") && l.includes("rounding"))).toBe(true);
  });
});

describe("summarize: invariants", () => {
  test("bandsByCell sums to bands; matrix sums to raised minus own and carried", () => {
    const { s } = one(
      [
        row({ tranId: "1", cents: 120000, zip5: "94502" }),
        row({
          tranId: "2",
          cents: 9000,
          zip5: "94601",
          entityCd: "OTH",
          entityLast: "Testco",
          entityFirst: "",
        }),
        row({
          tranId: "3",
          cents: 30000,
          zip5: "10001",
          entityCd: "COM",
          entityLast: "Test PAC",
          entityFirst: "",
        }),
        row({ tranId: "4", cents: -5000, zip5: null }),
        row({ tranId: "5", cents: 70000, entityLast: "Daysog", entityFirst: "Tony" }),
        row({
          tranId: "6",
          cents: 80000,
          entityCd: "COM",
          entityLast: "x",
          entityFirst: "",
          cmteId: "1404765",
        }),
      ],
      { late: [row({ tranId: "7", formType: "F497P1", cents: 15000, zip5: "94612" })] },
    );
    const cellBands = BANDS.map((b) =>
      LOCALITIES.flatMap((l) => DONOR_TYPES.map((t) => s.bandsByCell[l][t][b])).reduce((a, c) => a + c, 0),
    );
    expect(cellBands).toEqual(BANDS.map((b) => s.bands[b]));
    expect(sumMatrix(s)).toBe(s.raisedCents - s.ownCents - s.carriedCents);
    expect(s.raisedCents).toBe(319000);
    expect(s.outside).toEqual({ supportCents: 0, opposeCents: 0 });
  });
});

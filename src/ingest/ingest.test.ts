import { describe, expect, test } from "vitest";
import type { RacesFile } from "../elections/types.ts";
import { loaded, manifestEntry, row } from "./fixtures.ts";
import { crossCheck, ingest, serializeFinance, type IngestInput } from "./ingest.ts";
import type { LoadedFiling } from "./select.ts";

const RACES: RacesFile = {
  election: "2099-11-03-general",
  races: [
    {
      kind: "office",
      slug: "council",
      name: "City Council",
      seats: 2,
      links: {},
      candidates: [
        {
          slug: "pat-testperson",
          ballotName: "Pat Testperson",
          legalName: "Testperson, Pat",
          committees: [{ id: "1000001", name: "Testperson for Council 2026" }],
          priorCommittees: [{ id: "1000009", name: "Testperson for Council 2022" }],
        },
        {
          slug: "sam-shortform",
          ballotName: "Sam Shortform",
          legalName: "Shortform, Sam",
          committees: [],
          priorCommittees: [],
          shortForm: { form: "470-C", filed: "2026-09-14" },
        },
        {
          slug: "lee-nofiler",
          ballotName: "Lee Nofiler",
          legalName: "Nofiler, Lee",
          committees: [],
          priorCommittees: [],
        },
      ],
    },
    {
      kind: "measure",
      slug: "measure-q",
      name: "Measure Q",
      title: "A bond",
      links: {},
      sides: {
        yes: { committees: [{ id: "1000002", name: "Yes on Q 2026" }] },
        no: { committees: [] },
      },
    },
  ],
};

const SEPT = { from: "2026-07-01", thru: "2026-09-19" };
const OCT = { from: "2026-09-20", thru: "2026-10-17" };
const CAND = { filerKey: "1000001", filerId: "1000001", filerName: "Testperson for Council 2026" };
const YES = { filerKey: "1000002", filerId: "1000002", filerName: "Yes on Q 2026" };
const PAC = { filerKey: "2000001", filerId: "2000001", filerName: "Neighbors PAC" };

// Made-up individual contributors; none of these surnames may reach finance.json.
const SURNAMES = ["Quixwell", "Brambleton", "Ostrander"];

function fixtureFilings(): LoadedFiling[] {
  return [
    loaded({ path: "cand-460-sept.xls", filer: CAND.filerName, period: SEPT, filed: "2026-09-24" }, [
      row({ ...CAND, tranId: "A1", entityLast: SURNAMES[0], entityFirst: "Ann", cents: 50000 }),
      row({ ...CAND, tranId: "A2", entityLast: SURNAMES[1], entityFirst: "Bo", cents: 15000, zip5: "94607" }),
      row({
        ...CAND,
        tranId: "E1",
        recType: "EXPN",
        formType: "E",
        entityCd: "OTH",
        entityLast: "Print Shop",
        cents: 30000,
      }),
    ]),
    loaded({ path: "cand-460-oct.xls", filer: CAND.filerName, period: OCT, filed: "2026-10-22" }, [
      row({ ...CAND, tranId: "A3", entityLast: SURNAMES[2], entityFirst: "Cy", cents: 10000, zip5: "10001" }),
    ]),
    loaded(
      {
        path: "cand-497-late.xls",
        filer: CAND.filerName,
        form: "497",
        family: "497",
        period: null,
        filed: "2026-10-25",
      },
      [
        row({
          ...CAND,
          tranId: "L1",
          formType: "F497P1",
          tranDate: "2026-10-24",
          entityLast: SURNAMES[0],
          entityFirst: "Ann",
          cents: 20000,
        }),
      ],
    ),
    // Only an old row, already on the 460: this filing adds nothing and must not move dataThrough.
    loaded(
      {
        path: "cand-497-old.xls",
        filer: CAND.filerName,
        form: "497",
        family: "497",
        period: null,
        filed: "2026-10-30",
      },
      [
        row({
          ...CAND,
          tranId: "L0",
          formType: "F497P1",
          tranDate: "2026-10-01",
          entityLast: SURNAMES[1],
          entityFirst: "Bo",
          cents: 5000,
        }),
      ],
    ),
    loaded({ path: "yes-460.xls", filer: YES.filerName, period: OCT, filed: "2026-10-21" }, [
      row({ ...YES, tranId: "Y1", entityCd: "OTH", entityLast: "Builders Council", cents: 250000 }),
    ]),
    loaded({ path: "pac-460.xls", filer: PAC.filerName, period: OCT, filed: "2026-10-22" }, [
      row({
        ...PAC,
        tranId: "D1",
        recType: "EXPN",
        formType: "D",
        expnCode: "IND",
        entityCd: "OTH",
        candLast: "Pat Testperson",
        supOpp: "S",
        cents: 40000,
      }),
      row({
        ...PAC,
        tranId: "D2",
        recType: "EXPN",
        formType: "D",
        expnCode: "IND",
        entityCd: "OTH",
        balNum: "Q",
        supOpp: "O",
        cents: 12000,
      }),
    ]),
    loaded(
      {
        path: "pac-496.xls",
        filer: PAC.filerName,
        form: "496",
        family: "496",
        period: null,
        filed: "2026-10-27",
      },
      [
        row({
          ...PAC,
          tranId: "X1",
          recType: "S496",
          formType: "F496",
          tranDate: "2026-10-26",
          description: "Mailer for Pat Testperson",
          cents: 1001,
        }),
        row({
          ...PAC,
          tranId: "X2",
          recType: "S496",
          formType: "F496",
          tranDate: "2026-10-26",
          description: "Mailer",
          cents: 7000,
        }),
      ],
    ),
  ];
}

const MANIFEST = [
  manifestEntry({
    path: "paper-not-downloaded",
    filer: "Testperson for Council 2026",
    filed: "2026-07-31",
    period: { from: "2026-01-01", thru: "2026-06-30" },
    note: "paper PDF only",
  }),
  manifestEntry({
    path: "paper-not-downloaded",
    filer: "Testperson for Council 2022",
    filed: "2026-07-31",
    note: "paper PDF only",
  }),
  manifestEntry({ path: "paper-not-downloaded", filer: "Some Other Committee", filed: "2026-07-31" }),
  manifestEntry({ path: "viewer-only", filer: "Sam Shortform", form: "470-C", filed: "2026-09-14" }),
];

function input(filings = fixtureFilings()): IngestInput {
  return {
    filings,
    manifest: MANIFEST,
    races: RACES,
    attributions: {
      "2000001:X1": {
        targets: [{ target: "council/pat-testperson", side: "support" }],
        why: "names the candidate",
      },
    },
    corrections: [],
    countyZips: new Set(["94501", "94502", "94607"]),
    collectedOn: "2026-10-31",
  };
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("ingest", () => {
  test("statuses: filed, short-form and no-filings with all zeros", () => {
    const { finance } = ingest(input());
    expect(finance.summaries["council/pat-testperson"].status).toBe("filed");
    expect(finance.summaries["measure-q/yes"].status).toBe("filed");
    const short = finance.summaries["council/sam-shortform"];
    expect(short.status).toBe("short-form");
    for (const key of ["council/lee-nofiler", "measure-q/no"]) {
      const s = finance.summaries[key];
      expect(s.status).toBe("no-filings");
      expect([s.raisedCents, s.spentCents, s.ownCents, s.carriedCents, s.contributionCount]).toEqual([
        0, 0, 0, 0, 0,
      ]);
      expect([
        s.loansFromCandidateCents,
        s.otherLoansCents,
        s.outside.supportCents,
        s.outside.opposeCents,
      ]).toEqual([0, 0, 0, 0]);
    }
    expect(Object.keys(finance.summaries)).toEqual([
      "council/pat-testperson",
      "council/sam-shortform",
      "council/lee-nofiler",
      "measure-q/yes",
      "measure-q/no",
    ]);
  });

  test("raised counts the candidate's 460s and the late 497 row", () => {
    const { finance } = ingest(input());
    const s = finance.summaries["council/pat-testperson"];
    expect(s.raisedCents).toBe(50000 + 15000 + 10000 + 20000);
    expect(s.spentCents).toBe(30000);
    expect(finance.summaries["measure-q/yes"].raisedCents).toBe(250000);
  });

  test("summaries' outside amounts equal the sums from outsideGroups", () => {
    const { finance } = ingest(input());
    expect(finance.outsideGroups).toEqual([
      {
        key: "2000001",
        name: "Neighbors PAC",
        totals: [
          { target: "council/pat-testperson", side: "support", cents: 40000 + 1001 },
          { target: "measure-q/yes", side: "oppose", cents: 12000 },
        ],
      },
    ]);
    for (const [key, s] of Object.entries(finance.summaries)) {
      const totals = finance.outsideGroups.flatMap((g) => g.totals).filter((t) => t.target === key);
      const sum = (side: string) => totals.filter((t) => t.side === side).reduce((a, t) => a + t.cents, 0);
      expect(s.outside).toEqual({ supportCents: sum("support"), opposeCents: sum("oppose") });
    }
    expect(finance.unmatched.map((u) => u.tranId)).toEqual(["X2"]);
  });

  test("dataThrough is the latest period thru or counted late-report filing date; collectedOn passes through", () => {
    const { finance } = ingest(input());
    // pac-496 filed 10/27 is the latest counted late filing; cand-497-old (10/30) counts nothing.
    expect(finance.dataThrough).toBe("2026-10-27");
    expect(finance.collectedOn).toBe("2026-10-31");
    const without496 = fixtureFilings().filter((f) => f.entry.path !== "pac-496.xls");
    expect(ingest(input(without496)).finance.dataThrough).toBe("2026-10-25");
  });

  test("filings lists what was used, not the filing that added nothing", () => {
    const { finance } = ingest(input());
    expect(finance.filings.map((f) => f.file).sort()).toEqual([
      "cand-460-oct.xls",
      "cand-460-sept.xls",
      "cand-497-late.xls",
      "pac-460.xls",
      "pac-496.xls",
      "yes-460.xls",
    ]);
    expect(finance.filings.find((f) => f.file === "cand-460-oct.xls")).toEqual({
      filerKey: "1000001",
      filer: "Testperson for Council 2026",
      form: "460",
      amendment: 0,
      filed: "2026-10-22",
      period: OCT,
      source: "efile",
      file: "cand-460-oct.xls",
    });
  });

  test("serialized output is byte-identical across calls and shuffled input order", () => {
    const first = serializeFinance(ingest(input()).finance);
    expect(serializeFinance(ingest(input()).finance)).toBe(first);
    for (const seed of [1, 7, 42]) {
      const filings = shuffled(fixtureFilings(), seed).map((f) => ({ ...f, rows: shuffled(f.rows, seed) }));
      expect(serializeFinance(ingest(input(filings)).finance)).toBe(first);
    }
    expect(first.endsWith("}\n")).toBe(true);
    expect(first.startsWith('{\n  "election": "2099-11-03-general",\n  "dataThrough"')).toBe(true);
  });

  test("serialized output names no individual contributor", () => {
    const text = serializeFinance(ingest(input()).finance);
    for (const name of SURNAMES) expect(text).not.toContain(name);
  });

  test("finance.json carries each correction with its race and candidate, and only the allowed fields", () => {
    const correction = {
      filing: "cand-460-oct.xls",
      tranId: "T2",
      field: "Entity_ZIP4",
      asFiled: "9451",
      correctedTo: "94501",
      reason: "Filer wrote a four-digit ZIP.",
      decidedBy: "human" as const,
      decidedAt: "2026-11-01T13:15:55Z",
    };
    const { finance } = ingest({ ...input(), corrections: [correction] });
    expect(finance.corrections).toEqual([{ ...correction, race: "council", candidate: "pat-testperson" }]);
    const parsed = JSON.parse(serializeFinance(finance)) as { corrections: Record<string, unknown>[] };
    expect(Object.keys(parsed.corrections[0]).sort()).toEqual(
      [...Object.keys(correction), "race", "candidate"].sort(),
    );
    expect(serializeFinance(finance)).not.toContain(SURNAMES[0]);
  });

  test("a correction on a filing no committee in the race owns carries null race and candidate", () => {
    const { finance } = ingest({
      ...input(),
      corrections: [
        {
          filing: "pac-460.xls",
          tranId: "D1",
          field: "Entity_ZIP4",
          asFiled: "x",
          correctedTo: "y",
          reason: "r",
          decidedBy: "agent",
          decidedAt: "2026-11-01T13:15:55Z",
        },
      ],
    });
    expect(finance.corrections[0]).toMatchObject({ race: null, candidate: null });
  });

  test("unreadFilings lists only paper-not-downloaded filings of a race's own committees (D13)", () => {
    const { finance, log } = ingest(input());
    expect(finance.unreadFilings).toEqual([
      {
        filer: "Testperson for Council 2026",
        form: "460",
        filed: "2026-07-31",
        period: "2026-01-01 to 2026-06-30",
        note: "paper PDF only",
      },
    ]);
    expect(log.some((l) => l.includes("Testperson for Council 2022") && l.includes("not downloaded"))).toBe(
      true,
    );
    expect(log.some((l) => l.includes("Some Other Committee") && l.includes("not downloaded"))).toBe(true);
  });

  test("a committee whose filings resolve to more than one filer key is logged, not fatal (R17)", () => {
    const blankId = { filerKey: `name:${CAND.filerName}`, filerId: "", filerName: CAND.filerName };
    const filings = [
      ...fixtureFilings(),
      loaded(
        {
          path: "cand-497-blank-id.xls",
          filer: CAND.filerName,
          form: "497",
          family: "497",
          period: null,
          filed: "2026-10-26",
        },
        [
          row({
            ...blankId,
            tranId: "L2",
            formType: "F497P1",
            tranDate: "2026-10-25",
            entityLast: SURNAMES[2],
            entityFirst: "Cy",
            cents: 1000,
          }),
        ],
      ),
    ];
    const { log } = ingest(input(filings));
    const mixed = log.filter((l) => l.includes("more than one filer key"));
    expect(mixed).toHaveLength(1);
    expect(mixed[0]).toContain("Testperson for Council 2026");
    expect(mixed[0]).toContain("1000001");
    expect(mixed[0]).toContain(`name:${CAND.filerName}`);
    expect(ingest(input()).log.some((l) => l.includes("more than one filer key"))).toBe(false);
  });
});

describe("crossCheck", () => {
  const header = [
    "Filer Name",
    "Form Type",
    "Amendment #",
    "Filing Date",
    "Filing Period Covered",
    "Entity Name",
    "Transaction Type",
    "Transaction Date",
    "Amount",
  ];
  const rec = (cells: string[]) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));

  test("compares ingest raised with the index rows of the counted filings", () => {
    const { finance } = ingest(input());
    const lines = crossCheck(
      [
        rec([
          "Testperson for Council 2026",
          "460  Recipient Committee Campaign Statement",
          "0",
          "2026-09-24T10:00:00",
          "",
          "x",
          "Monetary Contributions Received",
          "08/01/2026",
          "650",
        ]),
        rec([
          "Testperson for Council 2026",
          "460  Recipient Committee Campaign Statement",
          "0",
          "2026-10-22T10:00:00",
          "",
          "x",
          "Monetary Contributions Received",
          "10/01/2026",
          "100",
        ]),
        rec([
          "Testperson for Council 2026",
          "460  Recipient Committee Campaign Statement",
          "0",
          "2026-10-22T10:00:00",
          "",
          "x",
          "Payments Made",
          "10/01/2026",
          "999",
        ]),
        rec([
          "Testperson for Council 2026",
          "497  24-hour Contribution Report",
          "0",
          "2026-10-25T10:00:00",
          "",
          "x",
          "Contribution Received",
          "10/24/2026",
          "200",
        ]),
        // Filed 9/1: not a filing ingest counted.
        rec([
          "Testperson for Council 2026",
          "497  24-hour Contribution Report",
          "0",
          "2026-09-01T10:00:00",
          "",
          "x",
          "Contribution Received",
          "08/30/2026",
          "75",
        ]),
      ],
      finance,
      RACES,
    );
    const line = lines.find((l) => l.includes("council/pat-testperson"));
    expect(line).toContain("ingest $950.00");
    expect(line).toContain("index $950.00");
    expect(line).toContain("diff $0.00");
  });

  test("an index without the expected columns is skipped with a reason", () => {
    const { finance } = ingest(input());
    const lines = crossCheck([{ Foo: "1" }], finance, RACES);
    expect(lines).toEqual([expect.stringMatching(/^cross-check skipped: /)]);
  });
});

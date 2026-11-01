import { describe, expect, it } from "vitest";
import type { MeasureRace, Matrix, MoneySummary, OfficeRace } from "./types.ts";
import {
  cellLabel,
  displayName,
  formatDate,
  formatUsd,
  hasUnknownZip,
  heatOpacity,
  keyDateStates,
  othersCents,
  parseSlice,
  pct,
  shares,
  sliceBands,
  sliceCents,
  sliceLabel,
  sliceQuery,
  topCells,
  unknownZipNote,
  correctionLine,
  electionDescription,
  offBallotNote,
  correctionsFor,
  raceCorrections,
  raceTitle,
} from "./view.ts";

const zeroCell = { cents: 0, count: 0 };
function matrix(cents: Partial<Record<string, number>> = {}): Matrix {
  const m = {} as Matrix;
  for (const from of ["alameda", "county", "other"] as const) {
    m[from] = {} as Matrix["alameda"];
    for (const type of ["individual", "organization", "political"] as const) {
      const c = cents[`${from}/${type}`] ?? 0;
      m[from][type] = c ? { cents: c, count: 1 } : { ...zeroCell };
    }
  }
  return m;
}
const noBands = { "1000+": 0, "500-999": 0, "250-499": 0, "100-249": 0, "under-100": 0 };
function summary(
  cents: Partial<Record<string, number>> = {},
  over: Partial<MoneySummary> = {},
): MoneySummary {
  const m = matrix(cents);
  const bandsByCell = {} as MoneySummary["bandsByCell"];
  for (const from of ["alameda", "county", "other"] as const) {
    bandsByCell[from] = {
      individual: { ...noBands },
      organization: { ...noBands },
      political: { ...noBands },
    };
  }
  return {
    status: "filed",
    paper: false,
    raisedCents: 0,
    spentCents: 0,
    ownCents: 0,
    carriedCents: 0,
    loansFromCandidateCents: 0,
    otherLoansCents: 0,
    contributionCount: 0,
    matrix: m,
    bands: { ...noBands },
    bandsByCell,
    unknownLocalityCents: 0,
    outside: { supportCents: 0, opposeCents: 0 },
    reportedDiffs: [],
    ...over,
  };
}

describe("pct", () => {
  it("rounds and floors the tiny and zero cases", () => {
    expect(pct(1, 300)).toBe("<1%");
    expect(pct(0, 300)).toBe("0%");
    expect(pct(186, 300)).toBe("62%");
    expect(pct(300, 300)).toBe("100%");
  });
  it("never divides by zero", () => {
    expect(pct(5, 0)).toBe("0%");
  });
});

describe("shares and othersCents", () => {
  it("sums the matrix", () => {
    expect(othersCents(summary({ "alameda/individual": 600, "other/political": 400 }))).toBe(1000);
  });
  it("is null when nothing came from others", () => {
    expect(shares(summary())).toBeNull();
  });
  it("reports individuals and Alameda shares", () => {
    const s = summary({ "alameda/individual": 600, "county/organization": 200, "other/individual": 200 });
    expect(shares(s)).toEqual({ individuals: "80%", alameda: "60%" });
  });
});

describe("topCells", () => {
  it("skips zero cells and orders largest first", () => {
    const s = summary({
      "alameda/individual": 620,
      "county/individual": 140,
      "other/political": 90,
      "county/organization": 75,
      "other/individual": 75,
    });
    expect(topCells(s)).toEqual([
      { from: "alameda", type: "individual", label: "Alameda individuals", pct: "62%" },
      { from: "county", type: "individual", label: "county individuals", pct: "14%" },
      { from: "other", type: "political", label: "non-local political", pct: "9%" },
    ]);
  });
  it("returns fewer than n when fewer are nonzero, and none when empty", () => {
    expect(topCells(summary({ "alameda/individual": 5 }))).toHaveLength(1);
    expect(topCells(summary())).toEqual([]);
  });
  it("honors n", () => {
    const s = summary({ "alameda/individual": 5, "county/individual": 4, "other/individual": 3 });
    expect(topCells(s, 2)).toHaveLength(2);
  });
});

describe("cellLabel", () => {
  it("names a cell in words", () => {
    expect(cellLabel("alameda", "individual")).toBe("Alameda individuals");
    expect(cellLabel("county", "organization")).toBe("county organizations");
    expect(cellLabel("other", "political")).toBe("non-local political");
  });
});

describe("parseSlice", () => {
  it("ignores unknown values", () => {
    expect(parseSlice({ from: "mars" })).toEqual({});
    expect(parseSlice({ type: "" })).toEqual({});
  });
  it("ignores repeated parameters", () => {
    expect(parseSlice({ from: ["alameda", "county"] })).toEqual({});
  });
  it("reads both fields", () => {
    expect(parseSlice({ from: "alameda", type: "individual" })).toEqual({
      from: "alameda",
      type: "individual",
    });
  });
  it("ignores inherited property names", () => {
    expect(parseSlice({ from: "constructor", type: "__proto__" })).toEqual({});
  });
});

describe("sliceQuery", () => {
  it("is empty without a slice", () => {
    expect(sliceQuery({})).toBe("");
  });
  it("writes from first", () => {
    expect(sliceQuery({ type: "political", from: "other" })).toBe("?from=other&type=political");
    expect(sliceQuery({ type: "political" })).toBe("?type=political");
  });
});

describe("sliceLabel", () => {
  it("words each shape", () => {
    expect(sliceLabel({ from: "alameda", type: "individual" })).toBe("individuals from Alameda");
    expect(sliceLabel({ type: "political" })).toBe("political committees");
    expect(sliceLabel({ from: "alameda" })).toBe("donors from Alameda");
    expect(sliceLabel({})).toBeNull();
  });
  it("words the other localities and types", () => {
    expect(sliceLabel({ from: "county", type: "organization" })).toBe(
      "organizations from elsewhere in Alameda County",
    );
    expect(sliceLabel({ from: "other" })).toBe("donors from outside Alameda County");
  });
});

describe("sliceBands", () => {
  it("sums the selected cells' bands", () => {
    const s = summary();
    s.bandsByCell.alameda.individual["1000+"] = 100;
    s.bandsByCell.alameda.organization["1000+"] = 50;
    s.bandsByCell.alameda.political["under-100"] = 7;
    s.bandsByCell.county.individual["1000+"] = 999;
    expect(sliceBands(s, { from: "alameda" })).toEqual({ ...noBands, "1000+": 150, "under-100": 7 });
    expect(sliceBands(s, { type: "individual" })["1000+"]).toBe(1099);
    expect(sliceBands(s, { from: "alameda", type: "individual" })["1000+"]).toBe(100);
  });
  it("returns the full bands with no slice", () => {
    const s = summary({}, { bands: { ...noBands, "500-999": 42 } });
    expect(sliceBands(s, {})["500-999"]).toBe(42);
  });
});

describe("formatting", () => {
  it("formats whole dollars", () => {
    expect(formatUsd(1362049)).toBe("$13,620");
    expect(formatUsd(0)).toBe("$0");
  });
  it("rounds to the nearest dollar, half up", () => {
    expect(formatUsd(99999)).toBe("$1,000");
    expect(formatUsd(149)).toBe("$1");
    expect(formatUsd(150)).toBe("$2");
  });
  it("formats dates without a timezone shift", () => {
    expect(formatDate("2026-10-17")).toBe("October 17, 2026");
    expect(formatDate("2026-11-03")).toBe("November 3, 2026");
  });
});

describe("keyDateStates", () => {
  const dates = [
    { date: "2026-10-01", label: "a" },
    { date: "2026-10-17", label: "b" },
    { date: "2026-11-03", label: "c" },
  ];
  it("makes today's date the next one", () => {
    expect(keyDateStates(dates, "2026-10-17")).toEqual(["past", "next", "future"]);
  });
  it("makes the day after a date past", () => {
    expect(keyDateStates(dates, "2026-10-18")).toEqual(["past", "past", "next"]);
  });
  it("does not depend on input order", () => {
    const shuffled = [dates[2], dates[0], dates[1]];
    expect(keyDateStates(shuffled, "2026-10-17")).toEqual(["future", "past", "next"]);
  });
  it("marks everything past once the last date has gone by", () => {
    expect(keyDateStates(dates, "2026-11-04")).toEqual(["past", "past", "past"]);
  });
  it("marks everything future or next before the first", () => {
    expect(keyDateStates(dates, "2026-09-01")).toEqual(["next", "future", "future"]);
  });
});

describe("heatOpacity", () => {
  it("is zero for an empty cell and scales otherwise", () => {
    expect(heatOpacity(0)).toBe(0);
    expect(heatOpacity(1)).toBeCloseTo(1);
    expect(heatOpacity(0.5)).toBeCloseTo(0.54);
  });
});

describe("displayName", () => {
  const office = {
    kind: "office",
    slug: "mayor",
    name: "Mayor",
    seats: 1,
    links: {},
    candidates: [
      {
        slug: "jane",
        ballotName: "Jane Q. Doe",
        legalName: "Doe, Jane",
        committees: [],
        priorCommittees: [],
      },
    ],
  } satisfies OfficeRace;
  const measure = {
    kind: "measure",
    slug: "measure-l",
    name: "Measure L",
    title: "t",
    links: {},
    sides: { yes: { committees: [] }, no: { committees: [] } },
  } satisfies MeasureRace;
  it("names candidates by ballot name", () => {
    expect(displayName(office, "jane")).toBe("Jane Q. Doe");
  });
  it("names measure sides", () => {
    expect(displayName(measure, "yes")).toBe("Yes on Measure L");
    expect(displayName(measure, "no")).toBe("No on Measure L");
  });
  it("falls back to the key for an unknown candidate", () => {
    expect(displayName(office, "ghost")).toBe("ghost");
  });
});

describe("unknown-ZIP disclosure", () => {
  const unknown = summary({ "other/individual": 207500 }, { unknownLocalityCents: 207500 });
  const known = summary({ "other/individual": 207500 });

  it("hasUnknownZip and unknownZipNote follow unknownLocalityCents", () => {
    expect(hasUnknownZip(unknown)).toBe(true);
    expect(hasUnknownZip(known)).toBe(false);
    expect(hasUnknownZip(undefined)).toBe(false);
    expect(unknownZipNote(unknown)).toBe(
      "$2,075 of this has no usable ZIP code and is counted as outside Alameda County.",
    );
    expect(unknownZipNote(known)).toBeNull();
  });

  it("the other locality's wording discloses unknown ZIPs only when asked", () => {
    expect(sliceLabel({ from: "other" }, true)).toBe(
      "donors from outside Alameda County or with no usable ZIP",
    );
    expect(sliceLabel({ from: "other", type: "individual" }, true)).toBe(
      "individuals from outside Alameda County or with no usable ZIP",
    );
    expect(sliceLabel({ from: "other" }, false)).toBe("donors from outside Alameda County");
    expect(sliceLabel({ from: "alameda" }, true)).toBe("donors from Alameda");
    expect(sliceLabel({ type: "political" }, true)).toBe("political committees");
    expect(cellLabel("other", "individual", true)).toBe("non-local or no-ZIP individuals");
    expect(cellLabel("other", "individual")).toBe("non-local individuals");
    expect(cellLabel("county", "individual", true)).toBe("county individuals");
  });

  it("topCells labels the other cell with the disclosure only when the summary has unknown-ZIP money", () => {
    expect(topCells(unknown)[0].label).toBe("non-local or no-ZIP individuals");
    expect(topCells(known)[0].label).toBe("non-local individuals");
  });
});

describe("sliceCents", () => {
  const s = summary({ "alameda/individual": 100, "alameda/political": 20, "other/individual": 3 });
  it("sums the selected cells", () => {
    expect(sliceCents(s, {})).toBe(123);
    expect(sliceCents(s, { from: "alameda" })).toBe(120);
    expect(sliceCents(s, { type: "individual" })).toBe(103);
    expect(sliceCents(s, { from: "other", type: "individual" })).toBe(3);
    expect(sliceCents(s, { from: "county" })).toBe(0);
  });
});

describe("transcription corrections", () => {
  const applied = {
    filing: "pdf/x.pdf",
    tranId: "T-1",
    field: "Entity_ZIP4",
    asFiled: "9451",
    correctedTo: "94501",
    reason: "Filer wrote a four-digit ZIP; 94501 is the Alameda ZIP it most likely means.",
    decidedBy: "human" as const,
    decidedAt: "2026-11-01T13:15:55Z",
    race: "mayor",
    candidate: "tony-daysog",
  };

  it("correctionLine words a correction for the page", () => {
    expect(correctionLine(applied)).toEqual({
      key: "pdf/x.pdf|T-1|Entity_ZIP4",
      field: "ZIP code",
      reading: "written as 9451, read as 94501",
      reason: applied.reason,
      decision: "decided by a person on Nov 1, 2026, 5:15 AM PT",
    });
  });

  it("correctionLine names an agent decision and converts to Pacific time across daylight saving", () => {
    expect(correctionLine({ ...applied, decidedBy: "agent" }).decision).toBe(
      "decided by an AI agent on Nov 1, 2026, 5:15 AM PT",
    );
    expect(correctionLine({ ...applied, decidedAt: "2026-07-04T03:05:00Z" }).decision).toBe(
      "decided by a person on Jul 3, 2026, 8:05 PM PT",
    );
  });

  it("correctionLine says a blank field was left blank and keys the line by filing, row and field", () => {
    const line = correctionLine({ ...applied, field: "Entity_ST", asFiled: "", correctedTo: "CA" });
    expect(line.reading).toBe("left blank, read as CA");
    expect(line.key).toBe("pdf/x.pdf|T-1|Entity_ST");
  });

  it("raceCorrections groups a measure race's corrections by side and skips sides without any", () => {
    const measure: MeasureRace = {
      kind: "measure",
      slug: "measure-l",
      name: "Measure L",
      title: "t",
      links: {},
      sides: { yes: { committees: [] }, no: { committees: [] } },
    };
    const onYes = { ...applied, race: "measure-l", candidate: "yes" };
    const groups = raceCorrections([applied, onYes], measure);
    expect(groups.map((g) => g.name)).toEqual(["Yes on Measure L"]);
    expect(groups[0].lines).toEqual([correctionLine(onYes)]);
  });

  it("correctionLine falls back to the column name for a field it has no words for", () => {
    expect(correctionLine({ ...applied, field: "Odd_Col" }).field).toBe("Odd_Col");
  });

  it("correctionsFor picks one candidate's corrections and tolerates a missing list", () => {
    const other = { ...applied, candidate: "tracy-jensen" };
    expect(correctionsFor([applied, other], "mayor", "tony-daysog")).toEqual([applied]);
    expect(correctionsFor([applied], "mayor", "nobody")).toEqual([]);
    expect(correctionsFor(undefined, "mayor", "tony-daysog")).toEqual([]);
  });
});

describe("off-ballot races", () => {
  const office: OfficeRace = { kind: "office", slug: "s", name: "S", seats: 1, links: {}, candidates: [] };

  it("offBallotNote is null unless onBallot is false", () => {
    expect(offBallotNote(office)).toBeNull();
    expect(offBallotNote({ ...office, onBallot: true })).toBeNull();
  });

  it("offBallotNote is the one standard sentence", () => {
    expect(offBallotNote({ ...office, onBallot: false })).toBe(
      "Ran unopposed, so this seat is not on the ballot.",
    );
  });

  it("raceTitle pairs an on-ballot race with the election date and an off-ballot one with neither date nor vote", () => {
    expect(raceTitle({ ...office, name: "Mayor" }, "2026-11-03")).toBe("Mayor · November 3, 2026");
    expect(raceTitle({ ...office, name: "School Board, two-year term", onBallot: false }, "2026-11-03")).toBe(
      "School Board, two-year term · not on the ballot",
    );
  });

  it("electionDescription does not promise a vote on every race", () => {
    expect(electionDescription("2026-11-03")).not.toMatch(/ballot|vote/i);
    expect(electionDescription("2026-11-03")).toContain("November 3, 2026");
  });
});

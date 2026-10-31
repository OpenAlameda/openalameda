import { describe, expect, it } from "vitest";
import type { MeasureRace, Matrix, MoneySummary, OfficeRace } from "./types.ts";
import {
  cellLabel,
  displayName,
  formatDate,
  formatUsd,
  heatOpacity,
  keyDateStates,
  othersCents,
  parseSlice,
  pct,
  shares,
  sliceBands,
  sliceLabel,
  sliceQuery,
  topCells,
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

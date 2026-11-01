import { describe, expect, test } from "vitest";
import type { Correction } from "../elections/types.ts";
import { loaded, row } from "./fixtures.ts";
import {
  applyCorrections,
  applyLocalityOverrides,
  CORRECTABLE_FIELDS,
  parseCorrections,
  type FilingRecords,
} from "./corrections.ts";
import { toCalRows } from "./raw.ts";

const FILING = "pdf/testperson-460-10222026.pdf";
const CORRECTION: Correction = {
  filing: FILING,
  tranId: "T-1",
  field: "Entity_ZIP4",
  asFiled: "9451",
  correctedTo: "94501",
  reason: "Filer wrote a four-digit ZIP; 94501 is the Alameda ZIP it most likely means.",
  decidedBy: "human",
  decidedAt: "2026-11-01T13:15:55Z",
};

// Contributor names here are made up.
const files = (): FilingRecords[] => [
  {
    path: FILING,
    records: [
      { Tran_ID: "T-1", "Entity_Nam L": "Testperson", Entity_ZIP4: "9451", Amount: "2000" },
      { Tran_ID: "T-2", "Entity_Nam L": "Otherperson", Entity_ZIP4: "9451", Amount: "50" },
    ],
  },
  { path: "other.xls", records: [{ Tran_ID: "T-1", Entity_ZIP4: "9451" }] },
];

describe("applyCorrections", () => {
  test("applies to the named row only and logs one line without a name", () => {
    const log: string[] = [];
    const out = applyCorrections(files(), [CORRECTION], log);
    expect(out[0].records[0].Entity_ZIP4).toBe("94501");
    expect(out[0].records[1].Entity_ZIP4).toBe("9451");
    expect(out[1].records[0].Entity_ZIP4).toBe("9451");
    expect(log).toEqual([`correction applied: ${FILING} T-1 Entity_ZIP4 "9451" -> "94501"`]);
    expect(log.join("\n")).not.toMatch(/Testperson|Otherperson/);
  });

  test("changes how the row is read, and leaves its input untouched", () => {
    const input = files();
    const before = JSON.stringify(input);
    const out = applyCorrections(input, [CORRECTION], []);
    expect(JSON.stringify(input)).toBe(before);
    expect(toCalRows(FILING, input[0].records, "paper")[0].zip5).toBeNull();
    expect(toCalRows(FILING, out[0].records, "paper")[0].zip5).toBe("94501");
  });

  test("finds a row by its derived Tran_ID when the filing leaves it blank", () => {
    const input = [{ path: FILING, records: [{ Tran_ID: "", Entity_ZIP4: "9451" }] }];
    const c = { ...CORRECTION, tranId: "testperson-460-10222026-1" };
    expect(applyCorrections(input, [c], [])[0].records[0].Entity_ZIP4).toBe("94501");
  });

  test("fills in a blank field, and only while the field is still exactly blank", () => {
    const blank: Correction = { ...CORRECTION, field: "Entity_ST", asFiled: "", correctedTo: "CA" };
    const input = [{ path: FILING, records: [{ Tran_ID: "T-1", Entity_ST: "" }] }];
    expect(applyCorrections(input, [blank], [])[0].records[0].Entity_ST).toBe("CA");
    for (const now of ["CA", " "]) {
      const moved = [{ path: FILING, records: [{ Tran_ID: "T-1", Entity_ST: now }] }];
      expect(() => applyCorrections(moved, [blank], [])).toThrow(/stale correction/);
    }
  });

  test.each([
    ["the filing is not found", { filing: "pdf/missing.pdf" }, /no such filing/],
    ["the tranId is not in the filing", { tranId: "T-9" }, /no row with that Tran_ID/],
    ["the field is not a column", { field: "Entity_ZIP9" }, /not a column/],
    ["the row no longer reads asFiled", { asFiled: "9452" }, /stale correction/],
  ])("throws when %s", (_name, change, message) => {
    expect(() => applyCorrections(files(), [{ ...CORRECTION, ...change }], [])).toThrow(message);
  });
});

describe("locality corrections", () => {
  const LOCALITY: Correction = {
    ...CORRECTION,
    field: "locality",
    asFiled: "unknown",
    correctedTo: "other",
    reason: "No ZIP was written; the city is outside Alameda County.",
  };

  test("parse accepts the derived-locality field with locality keys", () => {
    expect(parseCorrections({ corrections: [LOCALITY] })).toEqual([LOCALITY]);
    expect(parseCorrections({ corrections: [{ ...LOCALITY, asFiled: "county" }] })).toHaveLength(1);
  });

  test.each([
    ["a correctedTo that is not a locality key", { correctedTo: "unknown" }],
    ["an asFiled that is not a locality reading", { asFiled: "9451" }],
  ])("parse rejects %s", (_name, change) => {
    expect(() => parseCorrections({ corrections: [{ ...LOCALITY, ...change }] })).toThrow(
      /corrections\.json/,
    );
  });

  test("the column overlay leaves a locality correction alone, and does not need the field as a column", () => {
    const out = applyCorrections(files(), [LOCALITY], []);
    expect(out).toEqual(files());
  });

  test("applyLocalityOverrides sets the override on a copy of the row and checks the derived reading", () => {
    const zips = new Set(["94607"]);
    const filing = loaded({ path: FILING }, [row({ tranId: "T-1", zip5: null })]);
    const log: string[] = [];
    const out = applyLocalityOverrides([filing], [LOCALITY], zips, log);
    expect(out[0].rows[0].localityOverride).toBe("other");
    expect(filing.rows[0].localityOverride).toBeUndefined();
    expect(log).toEqual([`correction applied: ${FILING} T-1 locality "unknown" -> "other"`]);
    const withZip = loaded({ path: FILING }, [row({ tranId: "T-1", zip5: "94607" })]);
    expect(() => applyLocalityOverrides([withZip], [LOCALITY], zips, [])).toThrow(/stale correction/);
    expect(() => applyLocalityOverrides([filing], [{ ...LOCALITY, tranId: "T-9" }], zips, [])).toThrow(
      /no row with that Tran_ID/,
    );
    expect(() => applyLocalityOverrides([filing], [LOCALITY, LOCALITY], zips, [])).toThrow(/already has/);
  });
});

describe("parseCorrections", () => {
  test("a missing file means no corrections", () => {
    expect(parseCorrections(undefined)).toEqual([]);
  });

  test("accepts every allowlisted field and a blank asFiled", () => {
    for (const field of CORRECTABLE_FIELDS) {
      expect(parseCorrections({ corrections: [{ ...CORRECTION, field }] })).toHaveLength(1);
    }
    const blank = { ...CORRECTION, field: "Entity_ST", asFiled: "", correctedTo: "CA" };
    expect(parseCorrections({ corrections: [blank] })).toEqual([blank]);
  });

  test("names the allowlist when it rejects a field", () => {
    expect(() => parseCorrections({ corrections: [{ ...CORRECTION, field: "Entity_Adr1" }] })).toThrow(
      /cannot be corrected here; allowed: Entity_ZIP4/,
    );
  });

  test("reads well-formed entries", () => {
    expect(parseCorrections({ corrections: [CORRECTION] })).toEqual([CORRECTION]);
  });

  test.each([
    ["not an object with a list", { corrections: "x" }],
    ["a missing key", { corrections: [{ ...CORRECTION, reason: undefined }] }],
    ["an empty value", { corrections: [{ ...CORRECTION, reason: " " }] }],
    [
      "a decidedBy that is neither agent nor human",
      { corrections: [{ ...CORRECTION, decidedBy: "the maintainer" }] },
    ],
    ["an unknown key", { corrections: [{ ...CORRECTION, note: "x" }] }],
    ["a date without a time", { corrections: [{ ...CORRECTION, decidedAt: "2026-11-01" }] }],
    ["a timestamp without seconds", { corrections: [{ ...CORRECTION, decidedAt: "2026-11-01T13:15Z" }] }],
    [
      "a timestamp that is not UTC",
      { corrections: [{ ...CORRECTION, decidedAt: "2026-11-01T13:15:55-07:00" }] },
    ],
    ["an impossible timestamp", { corrections: [{ ...CORRECTION, decidedAt: "2026-13-45T13:15:55Z" }] }],
    ["a contributor-identifying field", { corrections: [{ ...CORRECTION, field: "Entity_Nam L" }] }],
    ["a street address", { corrections: [{ ...CORRECTION, field: "Entity_Adr1" }] }],
    ["an intermediary's name", { corrections: [{ ...CORRECTION, field: "Intr_Nam L" }] }],
    ["an impossible calendar date", { corrections: [{ ...CORRECTION, decidedAt: "2026-02-30T13:15:55Z" }] }],
  ])("rejects %s", (_name, json) => {
    expect(() => parseCorrections(json)).toThrow(/corrections\.json/);
  });
});

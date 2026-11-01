import { describe, expect, test } from "vitest";
import type { Correction } from "../elections/types.ts";
import { applyCorrections, parseCorrections, type FilingRecords } from "./corrections.ts";
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
      { Tran_ID: "T-2", "Entity_Nam L": "Otherperson", Entity_ZIP4: "94501", Amount: "50" },
    ],
  },
  { path: "other.xls", records: [{ Tran_ID: "T-1", Entity_ZIP4: "9451" }] },
];

describe("applyCorrections", () => {
  test("applies to the named row only and logs one line without a name", () => {
    const log: string[] = [];
    const out = applyCorrections(files(), [CORRECTION], log);
    expect(out[0].records[0].Entity_ZIP4).toBe("94501");
    expect(out[0].records[1].Entity_ZIP4).toBe("94501");
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

  test.each([
    ["the filing is not found", { filing: "pdf/missing.pdf" }, /no such filing/],
    ["the tranId is not in the filing", { tranId: "T-9" }, /no row with that Tran_ID/],
    ["the field is not a column", { field: "Entity_ZIP9" }, /not a column/],
    ["the row no longer reads asFiled", { asFiled: "9452" }, /stale correction/],
  ])("throws when %s", (_name, change, message) => {
    expect(() => applyCorrections(files(), [{ ...CORRECTION, ...change }], [])).toThrow(message);
  });
});

describe("parseCorrections", () => {
  test("a missing file means no corrections", () => {
    expect(parseCorrections(undefined)).toEqual([]);
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
  ])("rejects %s", (_name, json) => {
    expect(() => parseCorrections(json)).toThrow(/corrections\.json/);
  });
});

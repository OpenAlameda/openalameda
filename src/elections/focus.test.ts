import { describe, expect, it } from "vitest";
import { electionInFocus, isInFocus, todayInLA } from "./focus";
import type { Election } from "./types";

function election(over: Partial<Election> = {}): Election {
  return {
    slug: "2026-11-03-general",
    name: "November 3, 2026 General Election",
    papersAvailable: "2026-07-13",
    electionDay: "2026-11-03",
    resultsFinal: null,
    keyDates: [],
    links: {},
    ...over,
  };
}

describe("isInFocus", () => {
  it("starts at Los Angeles midnight, 7 days before papers are available", () => {
    const e = election();
    expect(isInFocus(e, new Date("2026-07-05T23:59:00-07:00"))).toBe(false);
    expect(isInFocus(e, new Date("2026-07-06T00:00:00-07:00"))).toBe(true);
  });

  it("ends after day 30 following the certified results", () => {
    const e = election({ resultsFinal: "2026-12-03" });
    expect(isInFocus(e, new Date("2027-01-02T23:59:00-08:00"))).toBe(true);
    expect(isInFocus(e, new Date("2027-01-03T00:00:00-08:00"))).toBe(false);
  });

  it("stays in focus indefinitely while results are not final", () => {
    expect(isInFocus(election(), new Date("2027-06-01T12:00:00-07:00"))).toBe(true);
  });
});

describe("electionInFocus", () => {
  const first = election({ slug: "a", electionDay: "2026-06-02", papersAvailable: "2026-02-10" });
  const second = election({ slug: "b" });
  const now = new Date("2026-07-10T12:00:00-07:00");

  it("prefers the earlier election day when two overlap", () => {
    expect(electionInFocus([second, first], now)?.slug).toBe("a");
  });

  it("returns undefined when none is in focus", () => {
    expect(electionInFocus([second], new Date("2026-01-01T12:00:00-08:00"))).toBeUndefined();
  });
});

describe("todayInLA", () => {
  it("reads the date in Los Angeles, not UTC", () => {
    expect(todayInLA(new Date("2026-11-01T06:30:00Z"))).toBe("2026-10-31");
  });
});

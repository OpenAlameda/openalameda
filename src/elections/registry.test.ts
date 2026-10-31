import { describe, expect, it } from "vitest";
import { ELECTIONS, getElection, getRace, getRaces, summaryKey } from "./registry";
import type { Committee } from "./types";

const SLUG = "2026-11-03-general";
const races = getRaces(SLUG)!.races;

function committeesOf(): { owner: string; committee: Committee }[] {
  return races.flatMap((r) =>
    r.kind === "office"
      ? r.candidates.flatMap((c) =>
          c.committees.map((committee) => ({ owner: `${r.slug}/${c.slug}`, committee })),
        )
      : (["yes", "no"] as const).flatMap((side) =>
          r.sides[side].committees.map((committee) => ({ owner: `${r.slug}/${side}`, committee })),
        ),
  );
}

describe("registry", () => {
  it("lists elections and finds them by slug", () => {
    expect(ELECTIONS.map((e) => e.slug)).toContain(SLUG);
    expect(getElection(SLUG)?.electionDay).toBe("2026-11-03");
    expect(getElection("nope")).toBeUndefined();
    expect(getRaces("nope")).toBeUndefined();
  });

  it("keeps races in display order", () => {
    expect(races.map((r) => r.slug)).toEqual([
      "mayor",
      "city-council",
      "school-board",
      "measure-l",
      "measure-m",
      "measure-n",
    ]);
  });

  it("has unique race slugs and unique candidate slugs within a race", () => {
    expect(new Set(races.map((r) => r.slug)).size).toBe(races.length);
    for (const r of races) {
      if (r.kind !== "office") continue;
      expect(new Set(r.candidates.map((c) => c.slug)).size).toBe(r.candidates.length);
    }
  });

  it("uses digit-only committee ids or null", () => {
    const all = [
      ...committeesOf().map((x) => x.committee),
      ...races.flatMap((r) => (r.kind === "office" ? r.candidates.flatMap((c) => c.priorCommittees) : [])),
    ];
    for (const c of all) expect(c.id === null || /^\d+$/.test(c.id)).toBe(true);
  });

  it("never lists a committee under two candidates or sides", () => {
    const names = committeesOf().map((x) => x.committee.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = committeesOf().flatMap((x) => (x.committee.id ? [x.committee.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds races and builds summary keys", () => {
    expect(getRace(SLUG, "measure-l")?.kind).toBe("measure");
    expect(getRace(SLUG, "mayor")?.kind).toBe("office");
    expect(getRace(SLUG, "nope")).toBeUndefined();
    expect(summaryKey("mayor", "tony-daysog")).toBe("mayor/tony-daysog");
  });
});

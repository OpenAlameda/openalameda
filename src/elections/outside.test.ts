import { describe, expect, it } from "vitest";
import { outsideLines } from "./outside";
import type { OutsideGroup, Race } from "./types";

const races: Race[] = [
  {
    kind: "office",
    slug: "mayor",
    name: "Mayor",
    seats: 1,
    links: {},
    candidates: [
      { slug: "a-one", ballotName: "Ann One", legalName: "One, Ann", committees: [], priorCommittees: [] },
      { slug: "b-two", ballotName: "Bo Two", legalName: "Two, Bo", committees: [], priorCommittees: [] },
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
];

describe("outsideLines", () => {
  it("shows each amount with its own side and target", () => {
    const g: OutsideGroup = {
      key: "1",
      name: "PAC",
      totals: [
        { target: "mayor/a-one", side: "support", cents: 337500 },
        { target: "mayor/b-two", side: "oppose", cents: 100000 },
        { target: "measure-l/yes", side: "support", cents: 5000 },
      ],
    };
    expect(outsideLines([g], races)).toEqual([
      {
        key: "1",
        name: "PAC",
        parts: ["$3,375 for Ann One", "$1,000 against Bo Two", "$50 for Yes on Measure L"],
      },
    ]);
  });

  it("omits a group with no local targets", () => {
    expect(outsideLines([{ key: "2", name: "X", totals: [] }], races)).toEqual([]);
  });

  it("drops unknown target keys", () => {
    const g: OutsideGroup = {
      key: "3",
      name: "Y",
      totals: [
        { target: "mayor/nobody", side: "support", cents: 100 },
        { target: "other-race/a", side: "support", cents: 100 },
        { target: "mayor/b-two", side: "support", cents: 200 },
      ],
    };
    expect(outsideLines([g], races)[0].parts).toEqual(["$2 for Bo Two"]);
    expect(outsideLines([{ ...g, totals: g.totals.slice(0, 2) }], races)).toEqual([]);
  });
});

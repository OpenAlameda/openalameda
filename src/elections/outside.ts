import type { OutsideGroup, Race } from "./types";
import { displayName, formatUsd } from "./view";

export type OutsideLine = { key: string; name: string; parts: string[] };

/**
 * One line per outside group, each amount tied to its own target: "$3,375 for Carrie Hahnel". Targets that
 * match no race, candidate or measure side are dropped, and a group left with none is omitted.
 */
export function outsideLines(groups: OutsideGroup[], races: Race[]): OutsideLine[] {
  const lines: OutsideLine[] = [];
  for (const g of groups) {
    const parts: string[] = [];
    for (const t of g.totals) {
      const [raceSlug, who] = t.target.split("/");
      const race = races.find((r) => r.slug === raceSlug);
      if (!race || !who) continue;
      const known =
        race.kind === "office" ? race.candidates.some((c) => c.slug === who) : who === "yes" || who === "no";
      if (!known) continue;
      parts.push(
        `${formatUsd(t.cents)} ${t.side === "support" ? "for" : "against"} ${displayName(race, who)}`,
      );
    }
    if (parts.length > 0) lines.push({ key: g.key, name: g.name, parts });
  }
  return lines;
}

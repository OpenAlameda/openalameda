import type { Race } from "./types";
import { displayName } from "./view";

/** The slugs that have a candidate page in a race: its candidates, or the two measure sides. */
export function candidateKeys(race: Race): string[] {
  return race.kind === "office" ? race.candidates.map((c) => c.slug) : ["yes", "no"];
}

/** The candidate's or side's name for this race, or undefined when the slug is not on the ballot. */
export function nameOf(race: Race, key: string): string | undefined {
  return candidateKeys(race).includes(key) ? displayName(race, key) : undefined;
}

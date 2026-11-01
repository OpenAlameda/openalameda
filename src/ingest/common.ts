// Helpers more than one ingest module needs. Pure. Erasable TypeScript only so Node can run it with type
// stripping.
import type { Candidate, Committee, RacesFile } from "../elections/types.ts";

/** Trimmed, with each run of whitespace as one space. */
export const squash = (s: string) => s.trim().replace(/\s+/g, " ");

/** A person's name for matching: accents, case and punctuation dropped, spaces collapsed. */
export const nameKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/ +/g, " ")
    .trim();

/** Cents as dollars for log text, e.g. -$1.50. */
export const usd = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

export type Entrant = {
  /** The summary key, "<race>/<candidate|yes|no>". */
  key: string;
  race: string;
  candidateSlug: string;
  committees: Committee[];
  candidate: Candidate | null;
};

/** Every candidate and measure side, in races.json display order. */
export function entrants(races: RacesFile): Entrant[] {
  const out: Entrant[] = [];
  for (const race of races.races) {
    if (race.kind === "office") {
      for (const c of race.candidates) {
        out.push({
          key: `${race.slug}/${c.slug}`,
          race: race.slug,
          candidateSlug: c.slug,
          committees: c.committees,
          candidate: c,
        });
      }
    } else {
      for (const side of ["yes", "no"] as const) {
        out.push({
          key: `${race.slug}/${side}`,
          race: race.slug,
          candidateSlug: side,
          committees: race.sides[side].committees,
          candidate: null,
        });
      }
    }
  }
  return out;
}

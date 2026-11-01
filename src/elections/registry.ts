import electionsJson from "../../data/elections.json";
import finance20261103General from "../../data/elections/2026-11-03-general/finance.json";
import races20261103General from "../../data/elections/2026-11-03-general/races.json";
import type { Election, FinanceFile, Race, RacesFile } from "./types";

// One static import per election so Vercel bundles the files. Add a line to each map for a new election.
const RACES: Record<string, RacesFile> = {
  "2026-11-03-general": races20261103General as RacesFile,
};

// finance.json comes from `pnpm ingest`; an election without one shows no money figures.
const FINANCE: Record<string, FinanceFile> = {
  "2026-11-03-general": finance20261103General as FinanceFile,
};

/** Newest election day first. */
export const ELECTIONS: Election[] = [...(electionsJson as Election[])].sort((a, b) =>
  b.electionDay.localeCompare(a.electionDay),
);

export function getElection(slug: string): Election | undefined {
  return ELECTIONS.find((e) => e.slug === slug);
}

export function getRaces(slug: string): RacesFile | undefined {
  return Object.hasOwn(RACES, slug) ? RACES[slug] : undefined;
}

export function getFinance(slug: string): FinanceFile | undefined {
  return Object.hasOwn(FINANCE, slug) ? FINANCE[slug] : undefined;
}

export function getRace(election: string, race: string): Race | undefined {
  return getRaces(election)?.races.find((r) => r.slug === race);
}

/** Key into `FinanceFile.summaries`: "<race>/<candidate>" or "<race>/yes" | "<race>/no". */
export function summaryKey(raceSlug: string, candidateOrSide: string): string {
  return `${raceSlug}/${candidateOrSide}`;
}

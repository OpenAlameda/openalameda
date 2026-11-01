import type { Election } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO date (YYYY-MM-DD) of `now` in America/Los_Angeles. */
export function todayInLA(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * An election is in focus from 7 days before papers are available until 30 days after results are
 * final, inclusive of day 30; with no final date it stays in focus once it begins.
 */
export function isInFocus(e: Election, now: Date): boolean {
  const today = todayInLA(now);
  if (today < addDays(e.papersAvailable, -7)) return false;
  if (e.resultsFinal === null) return true;
  return today <= addDays(e.resultsFinal, 30);
}

/** The in-focus election; when several overlap, the one with the earlier election day. */
export function electionInFocus(es: Election[], now: Date): Election | undefined {
  return es.filter((e) => isInFocus(e, now)).sort((a, b) => a.electionDay.localeCompare(b.electionDay))[0];
}

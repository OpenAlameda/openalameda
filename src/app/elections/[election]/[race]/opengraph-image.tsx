import { notFound } from "next/navigation";
import { getElection, getFinance, getRace, summaryKey } from "@/elections/registry";
import { displayName, raceTitle } from "@/elections/view";
import { CARD_SIZE, withFallback } from "@/og/card";
import { raceCard } from "@/og/election-cards";

export const size = CARD_SIZE;
export const contentType = "image/png";
export const alt = "Campaign money in an Alameda race · OpenAlameda";
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ election: string; race: string }> }) {
  const { election: electionSlug, race: raceSlug } = await params;
  const election = getElection(electionSlug);
  const race = getRace(electionSlug, raceSlug);
  if (!election || !race) notFound();
  const finance = getFinance(election.slug);
  const keys = race.kind === "office" ? race.candidates.map((c) => c.slug) : ["yes", "no"];
  const bars = keys.map((key) => ({
    name: displayName(race, key),
    raisedCents: finance?.summaries[summaryKey(race.slug, key)]?.raisedCents ?? 0,
  }));
  if (race.kind === "office") bars.sort((a, b) => b.raisedCents - a.raisedCents);
  const title = raceTitle(race, election.electionDay);
  return withFallback(() => raceCard({ name: race.name, bars, dataThrough: finance?.dataThrough }), title);
}

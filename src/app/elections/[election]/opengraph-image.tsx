import { notFound } from "next/navigation";
import { getElection, getFinance } from "@/elections/registry";
import { CARD_SIZE, withFallback } from "@/og/card";
import { electionCard } from "@/og/election-cards";

export const size = CARD_SIZE;
export const contentType = "image/png";
export const alt = "Campaign money in the election · OpenAlameda";
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ election: string }> }) {
  const election = getElection((await params).election);
  if (!election) notFound();
  const dataThrough = getFinance(election.slug)?.dataThrough;
  return withFallback(() => electionCard({ name: election.name, dataThrough }), election.name);
}

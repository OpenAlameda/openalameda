import { getElection, getFinance, getRace, summaryKey } from "@/elections/registry";
import { displayName, parseSlice, sliceLabel } from "@/elections/view";
import { withFallback } from "@/og/card";
import { candidateCard } from "@/og/election-cards";

type Ctx = { params: Promise<{ election: string; race: string; candidate: string }> };

/** The preview card for a candidate page; `?from=` and `?type=` name the slice in words. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const { election: electionSlug, race: raceSlug, candidate } = await params;
  const election = getElection(electionSlug);
  const race = getRace(electionSlug, raceSlug);
  const known =
    race?.kind === "office"
      ? race.candidates.some((c) => c.slug === candidate)
      : candidate === "yes" || candidate === "no";
  if (!election || !race || !known) return new Response("Not found", { status: 404 });

  const summary = getFinance(election.slug)?.summaries[summaryKey(race.slug, candidate)];
  const query = new URL(request.url).searchParams;
  const pick = (key: string) => {
    const all = query.getAll(key);
    return all.length > 1 ? all : all[0];
  };
  const slice = summary?.status === "filed" ? parseSlice({ from: pick("from"), type: pick("type") }) : {};
  const name = displayName(race, candidate);
  return withFallback(() => candidateCard({ name, summary, slice: sliceLabel(slice) }), name);
}

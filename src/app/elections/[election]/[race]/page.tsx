import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateMoney } from "@/components/elections/CandidateMoney";
import { SourceLine } from "@/components/elections/SourceLine";
import { ELECTIONS, getElection, getFinance, getRace, getRaces, summaryKey } from "@/elections/registry";
import type { MoneySummary, Race } from "@/elections/types";
import { displayName, formatDate, formatUsd } from "@/elections/view";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ election: string; race: string }> };

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return ELECTIONS.flatMap((e) =>
    (getRaces(e.slug)?.races ?? []).map((r) => ({ election: e.slug, race: r.slug })),
  );
}

/** The race's candidates, or its Yes and No sides, with the slug that keys their summary. */
function entries(race: Race): { key: string; name: string }[] {
  return race.kind === "office"
    ? race.candidates.map((c) => ({ key: c.slug, name: c.ballotName }))
    : (["yes", "no"] as const).map((side) => ({ key: side, name: displayName(race, side) }));
}

/** Filed money first, biggest raised first; no-filings and short-form entries follow in ballot order. */
function sortedByRaised<T extends { summary: MoneySummary | undefined }>(items: T[]): T[] {
  const filed = (i: T) => i.summary?.status === "filed";
  return [
    ...items.filter(filed).sort((a, b) => b.summary!.raisedCents - a.summary!.raisedCents),
    ...items.filter((i) => !filed(i)),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { election: electionSlug, race: raceSlug } = await params;
  const election = getElection(electionSlug);
  const race = getRace(electionSlug, raceSlug);
  if (!election || !race) return {};
  const through = getFinance(electionSlug)?.dataThrough;
  const names = entries(race)
    .map((e) => e.name)
    .join(", ");
  return pageMetadata({
    title: `${race.name} · ${formatDate(election.electionDay)}`,
    description: `${names} — raised and spent, itemized${through ? `, through ${formatDate(through)}` : ""}.`,
    path: `/elections/${election.slug}/${race.slug}`,
  });
}

export default async function RacePage({ params }: Props) {
  const { election: electionSlug, race: raceSlug } = await params;
  const election = getElection(electionSlug);
  const race = getRace(electionSlug, raceSlug);
  if (!election || !race) notFound();
  const finance = getFinance(election.slug);
  const summaryOf = (key: string) => finance?.summaries[summaryKey(race.slug, key)];

  const items = entries(race).map((e) => ({ ...e, summary: summaryOf(e.key) }));
  const ordered = race.kind === "office" ? sortedByRaised(items) : items;
  const bothSidesEmpty =
    race.kind === "measure" && items.every((i) => !i.summary || i.summary.status === "no-filings");
  const shortForms =
    race.kind === "office" ? new Map(race.candidates.map((c) => [c.slug, c.shortForm?.filed])) : null;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm">
          <Link href={`/elections/${election.slug}`}>{election.name}</Link>
        </p>
        <h1 className="text-3xl font-semibold break-words">{race.name}</h1>
        {race.kind === "measure" && <p>{race.title}</p>}
        <p>Election day: {formatDate(election.electionDay)}.</p>
        {(race.links.ballotpedia || race.links.acvote) && (
          <ul className="list-disc pl-5">
            {race.links.ballotpedia && (
              <li>
                <a href={race.links.ballotpedia}>This race on Ballotpedia</a>
              </li>
            )}
            {race.links.acvote && (
              <li>
                <a href={race.links.acvote}>This race at the Alameda County Registrar of Voters</a>
              </li>
            )}
          </ul>
        )}
      </header>

      <section aria-labelledby="money" className="space-y-4">
        <h2 id="money" className="text-2xl font-semibold">
          {race.kind === "office" ? "Money by candidate" : "Money by side"}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ordered.map(({ key, name, summary }) => (
            <article key={key} className="min-w-0 space-y-3 rounded-lg p-4 ring-1 ring-ink/15">
              <CandidateMoney
                as="h3"
                variant="race"
                name={name}
                href={`/elections/${election.slug}/${race.slug}/${key}`}
                summary={summary}
                shortFormFiled={shortForms?.get(key)}
                bothSidesEmpty={bothSidesEmpty}
              />
              {summary && (summary.outside.supportCents > 0 || summary.outside.opposeCents > 0) && (
                <p className="text-sm">
                  Outside groups spent {formatUsd(summary.outside.supportCents)} for /{" "}
                  {formatUsd(summary.outside.opposeCents)} against
                </p>
              )}
              {summary && summary.reportedDiffs.length > 0 && (
                <div className="rounded-md bg-amber-50 p-3 text-sm ring-1 ring-amber-300">
                  <p className="font-semibold">Reported totals differ from the schedules</p>
                  <ul className="mt-1 list-disc pl-5">
                    {summary.reportedDiffs.map((d) => (
                      <li key={`${d.filed}-${d.line}`}>
                        Report filed {formatDate(d.filed)}, {d.label.toLowerCase()}: reported{" "}
                        {formatUsd(d.reportedCents)}, itemized lines add up to {formatUsd(d.scheduleCents)}.
                        We use the itemized lines.
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {finance && (
        <SourceLine
          dataThrough={finance.dataThrough}
          collectedOn={finance.collectedOn}
          unreadFilings={finance.unreadFilings}
        />
      )}
    </div>
  );
}

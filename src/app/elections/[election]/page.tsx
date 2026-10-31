import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateMoney } from "@/components/elections/CandidateMoney";
import { KeyDates } from "@/components/elections/KeyDates";
import { SourceLine } from "@/components/elections/SourceLine";
import { todayInLA } from "@/elections/focus";
import { ELECTIONS, getElection, getFinance, getRaces, summaryKey } from "@/elections/registry";
import type { FinanceFile, OutsideGroup, Race } from "@/elections/types";
import { displayName, formatDate, formatUsd } from "@/elections/view";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ election: string }> };

export const dynamicParams = false;
export const revalidate = 3600;

const COUNTY_ROV_URL = "https://www.acvote.alamedacountyca.gov/";

export function generateStaticParams() {
  return ELECTIONS.map((e) => ({ election: e.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const election = getElection((await params).election);
  if (!election) return {};
  return pageMetadata({
    title: election.name,
    description: `Who is paying for each City of Alameda race on the ${formatDate(election.electionDay)} ballot: raised, spent and where the money comes from.`,
    path: `/elections/${election.slug}`,
  });
}

/** The races and sides an outside group's totals can be tied to; anything else is left out of the page. */
function localTargets(group: OutsideGroup, races: Race[]) {
  const known = new Set(
    races.flatMap((r) =>
      r.kind === "office"
        ? r.candidates.map((c) => summaryKey(r.slug, c.slug))
        : [summaryKey(r.slug, "yes"), summaryKey(r.slug, "no")],
    ),
  );
  return group.totals.filter((t) => known.has(t.target));
}

function OutsideGroups({ finance, races }: { finance: FinanceFile; races: Race[] }) {
  const lines = finance.outsideGroups
    .map((g) => ({ group: g, targets: localTargets(g, races) }))
    .filter((l) => l.targets.length > 0)
    .map(({ group, targets }) => ({
      key: group.key,
      name: group.name,
      total: targets.reduce((sum, t) => sum + t.cents, 0),
      parts: targets.map((t) => {
        const [raceSlug, who] = t.target.split("/");
        const race = races.find((r) => r.slug === raceSlug)!;
        return `${t.side === "support" ? "for" : "against"} ${displayName(race, who)}`;
      }),
    }));
  if (lines.length === 0) return <p>No outside groups have reported spending on these races.</p>;
  return (
    <ul className="space-y-2">
      {lines.map((l) => (
        <li key={l.key} className="break-words">
          <span className="font-semibold">{l.name}</span>: {formatUsd(l.total)} {l.parts.join(", ")}
        </li>
      ))}
    </ul>
  );
}

export default async function ElectionPage({ params }: Props) {
  const election = getElection((await params).election);
  if (!election) notFound();
  const races = getRaces(election.slug)?.races ?? [];
  const finance = getFinance(election.slug);
  const today = todayInLA(new Date());
  const rov = election.links.acvote ?? COUNTY_ROV_URL;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">{election.name}</h1>
        <p>Election day: {formatDate(election.electionDay)}.</p>
        <ul className="list-disc pl-5">
          {election.links.ballotpedia && (
            <li>
              <a href={election.links.ballotpedia}>Ballotpedia</a>
            </li>
          )}
          <li>
            <a href={rov}>Alameda County Registrar of Voters</a>
          </li>
        </ul>
      </header>

      <section aria-labelledby="key-dates" className="space-y-3">
        <h2 id="key-dates" className="text-2xl font-semibold">
          Key dates
        </h2>
        <KeyDates dates={election.keyDates} today={today} />
      </section>

      <section aria-labelledby="races" className="space-y-4">
        <h2 id="races" className="text-2xl font-semibold">
          Races
        </h2>
        {races.map((race) => (
          <article key={race.slug} className="space-y-4 rounded-lg p-4 ring-1 ring-ink/15">
            <h3 className="text-xl font-semibold break-words">
              <Link href={`/elections/${election.slug}/${race.slug}`}>{race.name}</Link>
            </h3>
            {race.kind === "measure" && <p className="text-sm">{race.title}</p>}
            {race.kind === "office" ? (
              race.candidates.map((c) => (
                <CandidateMoney
                  key={c.slug}
                  as="h4"
                  name={c.ballotName}
                  summary={finance?.summaries[summaryKey(race.slug, c.slug)]}
                  shortFormFiled={c.shortForm?.filed}
                />
              ))
            ) : (
              <>
                {(["yes", "no"] as const).map((side) => (
                  <CandidateMoney
                    key={side}
                    as="h4"
                    name={displayName(race, side)}
                    summary={finance?.summaries[summaryKey(race.slug, side)]}
                    bothSidesEmpty={[
                      finance?.summaries[summaryKey(race.slug, "yes")],
                      finance?.summaries[summaryKey(race.slug, "no")],
                    ].every((s) => !s || s.status === "no-filings")}
                  />
                ))}
              </>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="outside-groups" className="space-y-3">
        <h2 id="outside-groups" className="text-2xl font-semibold">
          Outside groups
        </h2>
        {finance ? (
          <OutsideGroups finance={finance} races={races} />
        ) : (
          <p>No outside groups have reported spending on these races.</p>
        )}
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

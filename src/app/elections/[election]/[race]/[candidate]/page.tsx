import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateMoney } from "@/components/elections/CandidateMoney";
import { SourceLine } from "@/components/elections/SourceLine";
import { outsideLines } from "@/elections/outside";
import { ELECTIONS, getElection, getFinance, getRace, getRaces, summaryKey } from "@/elections/registry";
import { candidateKeys, nameOf } from "@/elections/slugs";
import { BANDS, type Band, type MoneySummary } from "@/elections/types";
import {
  correctionLine,
  correctionsFor,
  formatDate,
  formatUsd,
  hasUnknownZip,
  offBallotNote,
  othersCents,
  parseSlice,
  sliceBands,
  sliceCents,
  sliceLabel,
  sliceQuery,
  unknownZipNote,
  type Slice,
} from "@/elections/view";
import { pageMetadata } from "@/lib/metadata";

type Query = Record<string, string | string[] | undefined>;
type Props = {
  params: Promise<{ election: string; race: string; candidate: string }>;
  searchParams: Promise<Query>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return ELECTIONS.flatMap((e) =>
    (getRaces(e.slug)?.races ?? []).flatMap((r) =>
      candidateKeys(r).map((candidate) => ({ election: e.slug, race: r.slug, candidate })),
    ),
  );
}

const BAND_LABELS: Record<Band, string> = {
  "1000+": "$1,000+",
  "500-999": "$500–999",
  "250-499": "$250–499",
  "100-249": "$100–249",
  "under-100": "Under $100 (itemized)",
};

/** The slice that applies: only a page with filed money has a heatmap to filter. */
function effectiveSlice(summary: MoneySummary | undefined, query: Query): Slice {
  return summary?.status === "filed" ? parseSlice(query) : {};
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { election: electionSlug, race: raceSlug, candidate } = await params;
  const election = getElection(electionSlug);
  const race = getRace(electionSlug, raceSlug);
  const name = race && nameOf(race, candidate);
  if (!election || !race || !name) return {};
  const finance = getFinance(electionSlug);
  const summary = finance?.summaries[summaryKey(race.slug, candidate)];
  const slice = effectiveSlice(summary, await searchParams);
  const label = sliceLabel(slice, hasUnknownZip(summary));
  const path = `/elections/${election.slug}/${race.slug}/${candidate}`;
  const query = sliceQuery(slice);
  const who = race.kind === "office" ? `${name} (${race.name})` : name;

  let description: string;
  if (summary?.status === "filed") {
    description = `${who} raised ${formatUsd(summary.raisedCents)} and spent ${formatUsd(summary.spentCents)}${finance ? `, through ${formatDate(finance.dataThrough)}` : ""}.`;
    if (label) {
      description += ` ${label.charAt(0).toUpperCase()}${label.slice(1)}: ${formatUsd(sliceCents(summary, slice))} of the itemized contributions.`;
    }
  } else if (summary?.status === "short-form") {
    description = `${who} filed a short form: expects to raise and spend under $2,000.`;
  } else {
    description = `${who}: no campaign finance filings on record with the City.`;
  }

  const meta = pageMetadata({
    title: `Who gave to ${name}${label ? `: ${label}` : ""}`,
    description,
    path: `${path}${query}`,
  });
  // The file convention cannot see the query, so the card URL is set here.
  const images = [{ url: `${path}/card.png${query}`, width: 1200, height: 630, alt: `${name}: who gave` }];
  return {
    ...meta,
    openGraph: { ...meta.openGraph, images },
    twitter: { ...meta.twitter, images },
  };
}

export default async function CandidatePage({ params, searchParams }: Props) {
  const { election: electionSlug, race: raceSlug, candidate } = await params;
  const election = getElection(electionSlug);
  const race = getRace(electionSlug, raceSlug);
  const name = race && nameOf(race, candidate);
  if (!election || !race || !name) notFound();

  const finance = getFinance(election.slug);
  const summary = finance?.summaries[summaryKey(race.slug, candidate)];
  const slice = effectiveSlice(summary, await searchParams);
  const label = sliceLabel(slice, hasUnknownZip(summary));
  const path = `/elections/${election.slug}/${race.slug}/${candidate}`;
  const filed = summary?.status === "filed" ? summary : undefined;

  const shortFormFiled =
    race.kind === "office" ? race.candidates.find((c) => c.slug === candidate)?.shortForm?.filed : undefined;
  const bothSidesEmpty =
    race.kind === "measure" &&
    (["yes", "no"] as const).every((side) => {
      const s = finance?.summaries[summaryKey(race.slug, side)];
      return !s || s.status === "no-filings";
    });

  const bands = filed ? sliceBands(filed, slice) : undefined;
  const maxBand = bands ? Math.max(...BANDS.map((b) => bands[b])) : 0;
  const target = summaryKey(race.slug, candidate);
  const outside = outsideLines(
    (finance?.outsideGroups ?? [])
      .map((g) => ({ ...g, totals: g.totals.filter((t) => t.target === target) }))
      .filter((g) => g.totals.length > 0),
    [race],
  );

  const corrections = correctionsFor(finance?.corrections, race.slug, candidate).map(correctionLine);

  return (
    <div className="space-y-8">
      <p className="text-sm">
        <Link href={`/elections/${election.slug}/${race.slug}`}>{race.name}</Link>
      </p>

      <section className="space-y-4">
        <CandidateMoney
          as="h1"
          variant="race"
          name={name}
          summary={summary}
          shortFormFiled={shortFormFiled}
          bothSidesEmpty={bothSidesEmpty}
          hrefFor={(s) => `${path}${sliceQuery(s)}`}
          selected={slice}
        />
        {offBallotNote(race) && <p className="text-sm">{offBallotNote(race)}</p>}
        {filed && <p className="text-sm">Tap a square, or a row or column name, to see just that slice.</p>}
        {filed && unknownZipNote(filed) && <p className="text-sm">{unknownZipNote(filed)}</p>}
      </section>

      {filed && bands && othersCents(filed) > 0 && (
        <section aria-labelledby="bands" className="space-y-3">
          <h2 id="bands" className="text-2xl font-semibold">
            Gift sizes
          </h2>
          {label && (
            <p>
              <span className="inline-flex items-center gap-2 rounded-full bg-teal px-3 py-1 text-sm text-white">
                Showing {label}: {formatUsd(sliceCents(filed, slice))}
                <Link
                  href={path}
                  aria-label="Clear the filter and show all donors"
                  className="font-bold text-white no-underline"
                >
                  ×
                </Link>
              </span>
            </p>
          )}
          <ul className="space-y-2">
            {BANDS.map((b) => (
              <li key={b} className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-2 text-sm">
                <span>{BAND_LABELS[b]}</span>
                <span className="block h-4 rounded-sm bg-ink/10" aria-hidden="true">
                  <span
                    className="block h-4 rounded-sm bg-teal"
                    style={{ width: maxBand > 0 ? `${(bands[b] / maxBand) * 100}%` : "0%" }}
                  />
                </span>
                <span className="text-right">{formatUsd(bands[b])}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Each bar adds up itemized contributions by the size of the gift, not by donor. The last bar holds
            gifts under $100 that were itemized because the donor&apos;s total for the period passed $100.
            Smaller gifts are not reported one by one, so it is not all of the small gifts.
          </p>
        </section>
      )}

      {summary && summary.reportedDiffs.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm ring-1 ring-amber-300">
          <p className="font-semibold">Reported totals differ from the schedules</p>
          <ul className="mt-1 list-disc pl-5">
            {summary.reportedDiffs.map((d) => (
              <li key={`${d.filed}-${d.line}`}>
                Report filed {formatDate(d.filed)}, {d.label.toLowerCase()}: reported{" "}
                {formatUsd(d.reportedCents)}, itemized lines add up to {formatUsd(d.scheduleCents)}. We use
                the itemized lines.
              </li>
            ))}
          </ul>
        </div>
      )}

      {outside.length > 0 && (
        <section aria-labelledby="outside" className="space-y-3">
          <h2 id="outside" className="text-2xl font-semibold">
            Outside spending
          </h2>
          <p className="text-sm">Spent by groups apart from the campaign; not counted as raised.</p>
          <ul className="space-y-2">
            {outside.map((l) => (
              <li key={l.key} className="break-words">
                <span className="font-semibold">{l.name}</span>: {l.parts.join(" · ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {corrections.length > 0 && (
        <section aria-labelledby="readings" className="space-y-3">
          <h2 id="readings" className="text-2xl font-semibold">
            How we read the filings
          </h2>
          <p className="text-sm">
            Where a paper filing was unclear, we recorded how we read it. Every reading is listed here.
          </p>
          <ul className="space-y-2 text-sm">
            {corrections.map((c) => (
              <li key={`${c.field}-${c.reading}-${c.decision}`}>
                <span className="font-semibold">{c.field}:</span> {c.reading}. {c.reason} — {c.decision}.
              </li>
            ))}
          </ul>
        </section>
      )}

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

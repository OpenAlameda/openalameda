import Link from "next/link";
import type { MoneySummary } from "@/elections/types";
import { formatDate, formatUsd, shares, topCells } from "@/elections/view";
import { Heatmap } from "./Heatmap";
import { RaisedSpent } from "./RaisedSpent";

type CandidateMoneyProps = {
  /** Candidate's ballot name, or "Yes on Measure L". */
  name: string;
  /** Undefined when the election has no finance data yet; shown as no filings. */
  summary: MoneySummary | undefined;
  /** Links the name, e.g. to the candidate page. */
  href?: string;
  /** Date a short-form statement was filed, for the short-form line. */
  shortFormFiled?: string;
  /** Measure cards: neither side has filings, so say so for both. */
  bothSidesEmpty?: boolean;
  /** Heading element for the name; the page decides what fits its outline. */
  as?: "h2" | "h3" | "h4";
};

export function CandidateMoney({
  name,
  summary,
  href,
  shortFormFiled,
  bothSidesEmpty = false,
  as: Heading = "h3",
}: CandidateMoneyProps) {
  const title = (
    <Heading className="text-lg font-semibold break-words">
      {href ? <Link href={href}>{name}</Link> : name}
    </Heading>
  );

  if (!summary || summary.status === "no-filings") {
    return (
      <div>
        {title}
        <p className="mt-1">
          {bothSidesEmpty
            ? "No campaign finance filings on record with the City for either side."
            : "No campaign finance filings on record with the City."}
        </p>
      </div>
    );
  }

  if (summary.status === "short-form") {
    return (
      <div>
        {title}
        <p className="mt-1">
          Filed a short form: expects to raise and spend under $2,000. No committee.
          {shortFormFiled ? ` Filed ${formatDate(shortFormFiled)}.` : ""}
        </p>
      </div>
    );
  }

  const split = shares(summary);
  const top = topCells(summary);
  const { supportCents, opposeCents } = summary.outside;
  return (
    <div className="space-y-2">
      {title}
      {summary.paper && <p className="text-sm italic">from paper filing</p>}
      <RaisedSpent raisedCents={summary.raisedCents} spentCents={summary.spentCents} />
      {(summary.ownCents > 0 || summary.loansFromCandidateCents > 0 || summary.carriedCents > 0) && (
        <ul className="text-sm">
          {summary.ownCents > 0 && <li>{formatUsd(summary.ownCents)} from the candidate</li>}
          {summary.loansFromCandidateCents > 0 && (
            <li>{formatUsd(summary.loansFromCandidateCents)} loaned by the candidate</li>
          )}
          {summary.carriedCents > 0 && (
            <li>{formatUsd(summary.carriedCents)} carried over from an earlier campaign</li>
          )}
        </ul>
      )}
      {(supportCents > 0 || opposeCents > 0) && (
        <p className="text-sm">
          Outside groups: {formatUsd(supportCents)} supporting · {formatUsd(opposeCents)} opposing
        </p>
      )}
      {split ? (
        <>
          <p className="text-sm">
            {split.individuals} from individuals · {split.alameda} from Alameda
          </p>
          <Heatmap summary={summary} compact label={name} />
          {top.length > 0 && <p className="text-sm">{top.map((c) => `${c.pct} ${c.label}`).join(" · ")}</p>}
        </>
      ) : (
        <p className="text-sm">No itemized contributions from others.</p>
      )}
    </div>
  );
}

import { formatUsd } from "@/elections/view";

/** Raised and spent side by side, with a thin bar for spent as a share of raised (full when spending exceeds it). */
export function RaisedSpent({ raisedCents, spentCents }: { raisedCents: number; spentCents: number }) {
  const share = raisedCents > 0 ? Math.min(1, spentCents / raisedCents) : spentCents > 0 ? 1 : 0;
  return (
    <div>
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-semibold text-navy">{formatUsd(raisedCents)}</div>
          <div className="text-sm">raised</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-navy">{formatUsd(spentCents)}</div>
          <div className="text-sm">spent</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-navy/10" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-teal" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  );
}

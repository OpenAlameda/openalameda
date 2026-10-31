import type { KeyDate } from "@/elections/types";
import { formatDate, keyDateStates } from "@/elections/view";

/** Key dates with past ones muted and the next one highlighted. `today` is YYYY-MM-DD in Los Angeles. */
export function KeyDates({ dates, today }: { dates: KeyDate[]; today: string }) {
  const states = keyDateStates(dates, today);
  return (
    <ol className="space-y-1">
      {dates.map((d, i) => {
        const state = states[i];
        return (
          <li
            key={`${d.date}-${d.label}`}
            className={
              state === "past"
                ? "text-ink/70"
                : state === "next"
                  ? "rounded-md bg-teal/10 px-2 py-1 font-semibold text-navy ring-1 ring-teal/30"
                  : "px-2 py-1"
            }
            aria-current={state === "next" ? "date" : undefined}
          >
            <span className="tabular-nums">{formatDate(d.date)}</span>: {d.label}
            {state === "next" && <span className="ml-2 text-sm text-teal">Next</span>}
          </li>
        );
      })}
    </ol>
  );
}

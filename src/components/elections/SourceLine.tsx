import Link from "next/link";
import type { UnreadFiling } from "@/elections/types";
import { formatDate } from "@/elections/view";

/** "June 3, 2026" for ISO dates; anything else (the manifest's own spelling) passes through. */
function when(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
}

type SourceLineProps = { dataThrough: string; collectedOn: string; unreadFilings?: UnreadFiling[] };

export function SourceLine({ dataThrough, collectedOn, unreadFilings = [] }: SourceLineProps) {
  return (
    <div className="space-y-3 text-sm">
      <p>
        City of Alameda campaign disclosures, itemized contributions, data through {when(dataThrough)},
        collected {when(collectedOn)}. <Link href="/about#methodology--disclosures">How we count</Link>.
      </p>
      {unreadFilings.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 ring-1 ring-amber-300">
          <p className="font-semibold">Filings we couldn&apos;t read:</p>
          <ul className="mt-1 list-disc pl-5">
            {unreadFilings.map((f) => (
              <li key={`${f.filer}-${f.form}-${f.filed}-${f.period}`}>
                {f.filer}, form {f.form}, filed {when(f.filed)}
                {f.period ? ` (${f.period})` : ""}: {f.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

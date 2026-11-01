import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { electionInFocus } from "@/elections/focus";
import { ELECTIONS } from "@/elections/registry";
import { formatDate } from "@/elections/view";
import { PAGES, pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(PAGES.elections);

export default async function Elections() {
  // Focus depends on today's date, so decide per request.
  await connection();
  const focus = electionInFocus(ELECTIONS, new Date());
  if (focus) redirect(`/elections/${focus.slug}`);
  return (
    <>
      <h1 className="text-3xl font-semibold">Elections</h1>
      <ul className="mt-4 list-disc space-y-1 pl-5">
        {ELECTIONS.map((e) => (
          <li key={e.slug}>
            <Link href={`/elections/${e.slug}`}>{e.name}</Link>, {formatDate(e.electionDay)}
          </li>
        ))}
      </ul>
    </>
  );
}

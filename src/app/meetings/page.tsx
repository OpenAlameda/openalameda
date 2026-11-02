import { CONTACT_EMAIL } from "@/lib/site";
import { PAGES, pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(PAGES.meetings);

export default function Meetings() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Meetings</h1>
      <div className="mt-4 space-y-4">
        <p>Coming eventually.</p>
        <p>We plan to gather city meeting agendas, minutes, and votes.</p>
        <p>
          Ideas or help: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </>
  );
}

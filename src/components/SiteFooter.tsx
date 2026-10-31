import Link from "next/link";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-navy/10">
      {/* text-sm sits inside the column so 65ch matches the main column's width. */}
      <div className="mx-auto max-w-[65ch] px-4 py-6">
        <div className="space-y-2 text-sm">
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            {" · "}
            <a href={REPO_URL}>Code on GitHub</a>
          </p>
          <p>
            Data comes from public City of Alameda records; see <Link href="/about">About</Link>.
          </p>
          <p>OpenAlameda is an independent project, not affiliated with the City of Alameda.</p>
        </div>
      </div>
    </footer>
  );
}

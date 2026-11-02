"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";

const NAV = [PAGES.elections, PAGES.meetings, PAGES.about];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-navy/10">
      <div className="mx-auto flex max-w-[65ch] flex-col gap-2 px-4 py-4 md:flex-row md:items-baseline md:justify-between">
        <Link href="/" className="font-heading text-2xl font-semibold text-navy no-underline">
          {SITE_NAME}
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {NAV.map(({ path, title }) => (
              <li key={path}>
                <Link
                  href={path}
                  aria-current={pathname === path ? "page" : undefined}
                  className="aria-[current=page]:font-semibold"
                >
                  {title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

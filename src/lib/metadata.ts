import type { Metadata } from "next";
import { SITE_NAME } from "./site";

export type PageInfo = { title: string; description: string; path: string };

export const PAGES = {
  home: {
    title: SITE_NAME,
    description:
      "Civic data about Alameda, California, gathered and shared so residents can explore it and talk about it.",
    path: "/",
  },
  elections: {
    title: "Elections",
    description: "Campaign contributions in City of Alameda elections. The explorer is on its way.",
    path: "/elections",
  },
  meetings: {
    title: "Meetings",
    description: "City meeting agendas, minutes and votes. Coming eventually.",
    path: "/meetings",
  },
  about: {
    title: "About",
    description: "Who runs OpenAlameda, why, and how the site and its data are made.",
    path: "/about",
  },
} as const satisfies Record<string, PageInfo>;

/**
 * Builds a page's metadata. Preview images are deliberately not set here:
 * they come from each route's `opengraph-image` file convention. Paths stay
 * relative and resolve against the layout's `metadataBase`.
 */
export function pageMetadata({ title, description, path }: PageInfo): Metadata {
  const isHome = title === SITE_NAME;
  return {
    title: isHome ? { absolute: SITE_NAME } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

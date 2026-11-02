import AboutContent from "../../../content/about.mdx";
import { PAGES, pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(PAGES.about);

export default function About() {
  return (
    <article className="prose max-w-none prose-h1:text-3xl prose-h1:font-semibold">
      <AboutContent />
    </article>
  );
}

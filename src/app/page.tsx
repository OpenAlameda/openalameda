import Intro from "../../content/home.mdx";
import { SectionCard } from "@/components/SectionCard";
import { PAGES, pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(PAGES.home);

const SECTIONS = [PAGES.elections, PAGES.meetings];

export default function Home() {
  return (
    <>
      <h1 className="sr-only">{PAGES.home.title}</h1>
      <div className="prose prose-lg max-w-none">
        <Intro />
      </div>
      <div className="mt-8 space-y-4">
        {SECTIONS.map(({ path, title, description }) => (
          <SectionCard key={path} href={path} title={title} description={description} />
        ))}
      </div>
    </>
  );
}

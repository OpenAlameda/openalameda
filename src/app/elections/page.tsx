import { PAGES, pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(PAGES.elections);

export default function Elections() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Elections</h1>
      <p className="mt-4">The campaign contributions explorer is on its way.</p>
    </>
  );
}

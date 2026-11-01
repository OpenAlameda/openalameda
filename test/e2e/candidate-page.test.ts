import { expect, test } from "vitest";
import { pngSize } from "@/lib/png-size";
import { BASE_URL } from "./global-setup";

const SLUG = "2026-11-03-general";
const PATH = `/elections/${SLUG}`;
const get = (path: string) => fetch(`${BASE_URL}${PATH}/${path}`);
const text = async (path: string) => (await (await get(path)).text()).replace(/<!-- -->/g, "");
const tag = (html: string, re: RegExp) => html.match(re)?.[1] ?? "";
const title = (html: string) => tag(html, /<title>([^<]*)<\/title>/);
const description = (html: string) => tag(html, /<meta name="description" content="([^"]*)"/);
const canonical = (html: string) => tag(html, /<link rel="canonical" href="([^"]*)"/);

test("a paper filer's page shows the loan line and the paper label", async () => {
  const res = await get("mayor/tony-daysog");
  expect(res.status).toBe(200);
  const html = (await res.text()).replace(/<!-- -->/g, "");
  expect(title(html)).toMatch(/^Who gave to Tony Daysog/);
  expect(html).toContain("loaned by the candidate");
  expect(html).toContain("from paper filing");
  expect(html).toContain("Under $100 (itemized)");
  expect(html).toContain("not all of the small gifts");
});

test("the candidate's name is the page's visible h1", async () => {
  const html = await text("mayor/tony-daysog");
  expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
  expect(html).toMatch(/<h1[^>]*>(?:<a[^>]*>)?Tony Daysog/);
});

test("once every no-ZIP gift is placed by a correction, no unknown-ZIP disclosure is shown", async () => {
  const note = "has no usable ZIP code and is counted as outside Alameda County.";
  const html = await text("mayor/tony-daysog");
  expect(html).not.toContain(note);
  const sliced = await text("mayor/tony-daysog?from=other");
  expect(title(sliced)).toContain("from outside Alameda County");
  expect(title(sliced)).not.toContain("no usable ZIP");
  expect(await text("mayor/tracy-jensen")).not.toContain(note);
});

test("a candidate with transcription corrections lists each reading; others do not", async () => {
  const page = await text("mayor/tony-daysog");
  const html = (page.match(/<section aria-labelledby="readings"[\s\S]*?<\/section>/)?.[0] ?? "").replace(
    /<[^>]+>/g,
    "",
  );
  expect(html).toContain("How we read the filings");
  expect(html).toContain("ZIP code: written as 9451, read as 94501");
  expect(html).toContain("State: left blank, read as CA");
  expect(html).toContain("Where the money came from: no ZIP code, counted as outside Alameda County");
  expect(html).toContain("decided by a person on Nov 1, 2026, 5:15 AM PT");
  expect(html).toContain("decided by a person on Nov 1, 2026, 5:31 AM PT");
  expect(html.match(/decided by a person on Nov 1, 2026/g)).toHaveLength(3);
  expect(await text("mayor/tracy-jensen")).not.toContain("How we read the filings");
});

test("a candidate with no filings says so", async () => {
  expect(await text("school-board/gary-lym")).toContain(
    "No campaign finance filings on record with the City.",
  );
});

test("a short-form filer says so", async () => {
  expect(await text("city-council/steve-slauson")).toContain("Filed a short form");
});

test("a slice URL names the slice in title and description, canonicalizes it and offers a clear link", async () => {
  const query = "?from=alameda&type=individual";
  const html = await text(`city-council/marcie-johnson${query}`);
  expect(title(html)).toContain("individuals from Alameda");
  expect(description(html).toLowerCase()).toContain("individuals from alameda");
  expect(canonical(html)).toMatch(/\/city-council\/marcie-johnson\?from=alameda&(amp;)?type=individual$/);
  expect(html).toContain("bg-teal");
  expect(html).toContain(`href="${PATH}/city-council/marcie-johnson"`);
  expect(html).toContain("Clear the filter");
  expect(html).toContain(`/city-council/marcie-johnson/card.png${query.replace("&", "&amp;")}`);
});

test("invalid slice values are ignored: no slice in the title, plain canonical", async () => {
  const html = await text("city-council/marcie-johnson?from=mars&type=individual&type=political");
  expect(title(html)).not.toContain(" from ");
  expect(title(html)).not.toContain(":");
  expect(canonical(html)).toMatch(/marcie-johnson$/);
});

test("a slice with no money still renders", async () => {
  const res = await get("city-council/marcie-johnson?from=other&type=political");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Under $100 (itemized)");
});

test("a measure side has a page, and unknown slugs are 404", async () => {
  const res = await get("measure-l/yes");
  expect(res.status).toBe(200);
  expect(title(await res.text())).toMatch(/^Who gave to Yes on Measure L/);
  expect((await get("measure-l/maybe")).status).toBe(404);
  expect((await get("mayor/nobody")).status).toBe(404);
});

test("the preview card is a 1200x630 PNG with and without a slice", async () => {
  for (const query of ["", "?from=alameda&type=individual"]) {
    const res = await get(`mayor/tony-daysog/card.png${query}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 });
  }
  expect((await get("mayor/nobody/card.png")).status).toBe(404);
});

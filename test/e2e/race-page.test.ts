import { expect, test } from "vitest";
import { getFinance, getRaces } from "@/elections/registry";
import { formatUsd } from "@/elections/view";
import { BASE_URL } from "./global-setup";

const SLUG = "2026-11-03-general";
const race = (slug: string) => getRaces(SLUG)!.races.find((r) => r.slug === slug)!;
const get = (path: string) => fetch(`${BASE_URL}/elections/${SLUG}/${path}`);

test("the mayor page names every candidate, labels paper filing and links each candidate", async () => {
  const res = await get("mayor");
  expect(res.status).toBe(200);
  const html = await res.text();
  const mayor = race("mayor");
  if (mayor.kind !== "office") throw new Error("mayor is an office");
  for (const c of mayor.candidates) {
    expect(html).toContain(c.ballotName);
    expect(html).toContain(`/elections/${SLUG}/mayor/${c.slug}`);
  }
  expect(html).toContain("from paper filing");
  expect(html).toContain("Reported totals differ from the schedules");
  expect(html).toContain("data through");
});

test("the race page lists outside spending for and against, apart from raised", async () => {
  const finance = getFinance(SLUG)!;
  const vella = finance.summaries["mayor/malia-vella"];
  expect(vella.outside.supportCents).toBeGreaterThan(0);
  const html = (await (await get("mayor")).text()).replace(/<!-- -->/g, "");
  expect(html).toContain(
    `Outside groups spent ${formatUsd(vella.outside.supportCents)} for / ${formatUsd(vella.outside.opposeCents)} against`,
  );
});

test("filed candidates come first, biggest raised first, then the rest in ballot order", async () => {
  const mayor = race("mayor");
  if (mayor.kind !== "office") throw new Error("mayor is an office");
  const finance = getFinance(SLUG)!;
  const raised = (slug: string) => {
    const s = finance.summaries[`mayor/${slug}`];
    return s?.status === "filed" ? s.raisedCents : null;
  };
  const filed = mayor.candidates
    .filter((c) => raised(c.slug) !== null)
    .sort((a, b) => raised(b.slug)! - raised(a.slug)!);
  const rest = mayor.candidates.filter((c) => raised(c.slug) === null);
  const expected = [...filed, ...rest].map((c) => `/elections/${SLUG}/mayor/${c.slug}"`);
  const html = await (await get("mayor")).text();
  const found = expected.map((href) => html.indexOf(`href="${href}`));
  expect(found.every((i) => i >= 0)).toBe(true);
  expect(found).toEqual([...found].sort((a, b) => a - b));
});

test("a race page has a title, preview card and a unique heatmap label per candidate", async () => {
  const html = await (await get("city-council")).text();
  expect(html).toMatch(/<title>City Council · November 3, 2026/);
  expect(html).toContain('property="og:image"');
  const labels = [...html.matchAll(/<title id="[^"]*">([^<]*)<\/title>/g)].map((m) => m[1]);
  expect(labels.length).toBeGreaterThan(1);
  expect(new Set(labels).size).toBe(labels.length);
  const card = await fetch(`${BASE_URL}/elections/${SLUG}/city-council/opengraph-image`);
  expect(card.status).toBe(200);
  expect(card.headers.get("content-type")).toBe("image/png");
});

test("a measure page with no filings says so for both sides", async () => {
  const html = await (await get("measure-n")).text();
  expect(html).toContain("No campaign finance filings on record with the City for either side.");
  expect(html).toContain("Yes on Measure N");
  expect(html).toContain("No on Measure N");
});

test("an unknown race is a 404 inside the site frame", async () => {
  const res = await get("no-such-race");
  expect(res.status).toBe(404);
  expect(await res.text()).toContain("not affiliated with the City of Alameda");
});

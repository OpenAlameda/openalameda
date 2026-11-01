import { expect, test } from "vitest";
import { ELECTIONS, getFinance, getRaces } from "@/elections/registry";
import { candidateKeys, nameOf } from "@/elections/slugs";
import { formatUsd } from "@/elections/view";
import { electionInFocus } from "@/elections/focus";
import { BASE_URL } from "./global-setup";

const escapeHtml = (t: string) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

const SLUG = "2026-11-03-general";

test("/elections redirects to the election in focus, or lists every election", async () => {
  const res = await fetch(`${BASE_URL}/elections`, { redirect: "manual" });
  const focus = electionInFocus(ELECTIONS, new Date());
  if (focus) {
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toMatch(new RegExp(`/elections/${focus.slug}$`));
  } else {
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const e of ELECTIONS) expect(html).toContain(`/elections/${e.slug}`);
  }
});

test("the election page names every race, outside groups and the data date", async () => {
  const res = await fetch(`${BASE_URL}/elections/${SLUG}`);
  expect(res.status).toBe(200);
  const html = await res.text();
  for (const race of getRaces(SLUG)!.races) expect(html).toContain(escapeHtml(race.name));
  expect(html).toContain("Outside groups");
  expect(html).toContain("data through");
});

test("every card with outside money shows its outside-groups line, filings or not", async () => {
  const html = (await (await fetch(`${BASE_URL}/elections/${SLUG}`)).text()).replaceAll("<!-- -->", "");
  // Each card starts at its <h4>; the chunk after a card's name runs to the next card.
  const cards = html.split("<h4");
  const summaries = getFinance(SLUG)!.summaries;
  let noFilingsChecked = false;
  for (const race of getRaces(SLUG)!.races) {
    for (const key of candidateKeys(race)) {
      const s = summaries[`${race.slug}/${key}`];
      if (s.outside.supportCents === 0 && s.outside.opposeCents === 0) continue;
      const name = escapeHtml(nameOf(race, key)!);
      const card = cards.filter((c) => c.includes(`>${name}</h4>`));
      expect(card, `${race.slug}/${key}`).toHaveLength(1);
      const line = `Outside groups: ${formatUsd(s.outside.supportCents)} supporting · ${formatUsd(s.outside.opposeCents)} opposing`;
      expect(card[0], `${race.slug}/${key}`).toContain(escapeHtml(line));
      if (s.status === "no-filings") noFilingsChecked = true;
    }
  }
  expect(noFilingsChecked).toBe(true);
});

test("an unknown election is a 404 inside the site frame", async () => {
  const res = await fetch(`${BASE_URL}/elections/1999-01-01-general`);
  expect(res.status).toBe(404);
  expect(await res.text()).toContain("not affiliated with the City of Alameda");
});

import { expect, test } from "vitest";
import { ELECTIONS, getRaces } from "@/elections/registry";
import { electionInFocus } from "@/elections/focus";
import { BASE_URL } from "./global-setup";

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
  for (const race of getRaces(SLUG)!.races) expect(html).toContain(race.name);
  expect(html).toContain("Outside groups");
  expect(html).toContain("data through");
});

test("an unknown election is a 404 inside the site frame", async () => {
  const res = await fetch(`${BASE_URL}/elections/1999-01-01-general`);
  expect(res.status).toBe(404);
  expect(await res.text()).toContain("not affiliated with the City of Alameda");
});

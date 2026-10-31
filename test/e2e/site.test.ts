import { expect, test } from "vitest";
import { checkSite } from "@/check/check-site";
import { BASE_URL } from "./global-setup";

test("every route serves full share metadata in raw HTML", async () => {
  const results = await checkSite(BASE_URL);
  expect(results.filter((r) => r.problems.length)).toEqual([]);
});

test("unknown URL returns 404 inside the site frame", async () => {
  const res = await fetch(`${BASE_URL}/no-such-page`);
  expect(res.status).toBe(404);
  const html = await res.text();
  expect(html).toContain("not affiliated with the City of Alameda");
  expect(html).toMatch(/href="\/"/);
});

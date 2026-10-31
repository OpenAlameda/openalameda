import { afterEach, describe, expect, test, vi } from "vitest";
import { checkSite, findMeta } from "./check-site";

const html = `<!DOCTYPE html><html><head>
<title>Elections · OpenAlameda</title>
<meta name="description" content="Campaign contributions &amp; more"/>
<meta property="og:title" content="Elections"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta property='og:url' content='https://example.org/elections'/>
<link rel="canonical" href="https://example.org/elections"/>
</head><body></body></html>`;

describe("findMeta", () => {
  test("matches name= attributes and decodes entities", () => {
    expect(findMeta(html, "description")).toBe("Campaign contributions & more");
  });

  test("matches property= attributes", () => {
    expect(findMeta(html, "og:title")).toBe("Elections");
  });

  test("matches regardless of attribute order and quote style", () => {
    expect(findMeta(html, "twitter:card")).toBe("summary_large_image");
    expect(findMeta(html, "og:url")).toBe("https://example.org/elections");
  });

  test("reads the canonical link for the canonical key", () => {
    expect(findMeta(html, "canonical")).toBe("https://example.org/elections");
  });

  test("returns undefined for an absent key", () => {
    expect(findMeta(html, "og:image")).toBeUndefined();
  });
});

/** A page carrying every tag checkSite requires, with overrides by key. */
function page(base: string, path: string, override: Record<string, string | null> = {}): string {
  const tags: Record<string, string | null> = {
    description: "d",
    "og:title": "t",
    "og:description": "d",
    "twitter:card": "summary_large_image",
    canonical: path === "/" ? base : `${base}${path}`,
    ...override,
  };
  const head = Object.entries(tags)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([key, value]) =>
      key === "canonical"
        ? `<link rel="canonical" href="${value}"/>`
        : `<meta ${key.startsWith("og:") ? "property" : "name"}="${key}" content="${value}"/>`,
    );
  return `<html><head><title>t</title>${head.join("")}</head></html>`;
}

/** Stubs fetch to serve `page()` for every route, with overrides for one route. */
function serve(base: string, route: string, override: Record<string, string | null>) {
  vi.stubGlobal("fetch", async (url: URL) => {
    const html = page(base, url.pathname, url.pathname === route ? override : {});
    return new Response(html, { status: 200 });
  });
}

describe("checkSite", () => {
  const base = "https://example.org";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("accepts complete pages, with the root canonical lacking its trailing slash", async () => {
    serve(base, "/", {});
    const results = await checkSite(base);
    expect(results.flatMap((r) => r.problems)).toEqual([]);
  });

  test("rejects a relative canonical", async () => {
    serve(base, "/about", { canonical: "/about" });
    const about = (await checkSite(base)).find((r) => r.route === "/about");
    expect(about?.problems).toEqual(["canonical is /about, expected https://example.org/about"]);
  });

  test("reports a non-200 status alone", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    const results = await checkSite(base);
    expect(results.map((r) => r.problems)).toEqual(Array(4).fill(["status 404"]));
  });

  test("checks og:image only when checkImages is set", async () => {
    serve(base, "/meetings", { "og:image": "https://elsewhere.example/card.png" });
    expect((await checkSite(base)).flatMap((r) => r.problems)).toEqual([]);

    const problems = (await checkSite(base, { checkImages: true })).map((r) => r.problems);
    expect(problems).toEqual([
      ["missing og:image"],
      ["missing og:image"],
      ["og:image https://elsewhere.example/card.png is not an absolute URL on example.org"],
      ["missing og:image"],
    ]);
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { pngSize } from "@/lib/png-size";
import { ROUTES, checkSite, findMeta, parseBaseUrl } from "./check-site";

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

/** The PNG signature and an IHDR chunk header: just enough bytes for pngSize. */
function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("pngSize", () => {
  test("reads width and height from the IHDR chunk", () => {
    expect(pngSize(pngHeader(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  test("returns undefined for non-PNG bytes", () => {
    expect(pngSize(new TextEncoder().encode("<html><body>not an image</body></html>"))).toBeUndefined();
  });

  test("returns undefined when the signature is right but the first chunk is not IHDR", () => {
    const bytes = pngHeader(1200, 630);
    bytes.set([0x49, 0x44, 0x41, 0x54], 12);
    expect(pngSize(bytes)).toBeUndefined();
  });

  test("returns undefined for bytes too short to hold the dimensions", () => {
    expect(pngSize(pngHeader(1200, 630).subarray(0, 20))).toBeUndefined();
  });
});

/** Where Next serves a route's card, with the hash query it appends. */
function cardUrl(base: string, path: string): string {
  return `${base}${path === "/" ? "" : path}/opengraph-image?abc123`;
}

/** A page carrying every tag checkSite requires, with overrides by key. */
function page(base: string, path: string, override: Record<string, string | null> = {}, search = ""): string {
  const tags: Record<string, string | null> = {
    description: "d",
    "og:title": "t",
    "og:description": "d",
    "twitter:card": "summary_large_image",
    "og:image": cardUrl(base, path),
    canonical: path === "/" ? base : `${base}${path}${search}`,
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

/** A well-formed 1200x630 card response. */
function card(): Response {
  return new Response(pngHeader(1200, 630), { status: 200, headers: { "content-type": "image/png" } });
}

type Overrides = {
  /** Tag overrides for the page at `route`. */
  tags?: Record<string, string | null>;
  /** The response for the card at `route`. */
  image?: () => Response;
};

/**
 * Stubs fetch to serve `page()` for every route and `card()` for every card,
 * with overrides for one route. Returns the stub so tests can inspect calls.
 */
function serve(base: string, route: string, { tags = {}, image = card }: Overrides = {}) {
  const stub = vi.fn(async (url: URL) => {
    if (url.pathname.endsWith("/opengraph-image")) {
      const path = url.pathname.slice(0, -"/opengraph-image".length) || "/";
      return path === route ? image() : card();
    }
    const isRoute = url.pathname + url.search === route;
    return new Response(page(base, url.pathname, isRoute ? tags : {}, url.search), { status: 200 });
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

/** The problems checkSite reports for one route. */
async function problemsFor(base: string, route: string): Promise<string[] | undefined> {
  return (await checkSite(base)).find((r) => r.route === route)?.problems;
}

describe("checkSite", () => {
  const base = "https://example.org";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("accepts complete pages, with the root canonical lacking its trailing slash", async () => {
    serve(base, "/");
    const results = await checkSite(base);
    expect(results.flatMap((r) => r.problems)).toEqual([]);
  });

  test("rejects a relative canonical", async () => {
    serve(base, "/about", { tags: { canonical: "/about" } });
    expect(await problemsFor(base, "/about")).toEqual([
      "canonical is /about, expected https://example.org/about",
    ]);
  });

  test("expects a route's query string in its canonical", async () => {
    const route = "/elections/2026-11-03-general/city-council/marcie-johnson?from=alameda&type=individual";
    serve(base, route);
    expect(await problemsFor(base, route)).toEqual([]);
    const bare = `${base}${route.split("?")[0]}`;
    serve(base, route, { tags: { canonical: bare } });
    expect(await problemsFor(base, route)).toEqual([`canonical is ${bare}, expected ${base}${route}`]);
  });

  test("reports every missing tag on a page with an empty head", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html><head></head></html>", { status: 200 }));
    expect(await problemsFor(base, "/")).toEqual([
      "missing <title>",
      "missing description",
      "missing og:title",
      "missing og:description",
      "twitter:card is missing, expected summary_large_image",
      "canonical is missing, expected https://example.org/",
      "missing og:image",
    ]);
  });

  test.each(["https://example.org/app", "https://example.org/?x=1", "not a url"])(
    "rejects a base URL that is not a bare origin: %s",
    async (badBase) => {
      vi.stubGlobal("fetch", vi.fn());
      await expect(checkSite(badBase)).rejects.toThrow(/Base URL/);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("accepts an origin with or without its trailing slash", () => {
    expect(parseBaseUrl("https://example.org").href).toBe("https://example.org/");
    expect(parseBaseUrl("https://example.org/").href).toBe("https://example.org/");
  });

  test("reports a non-200 status alone", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    const results = await checkSite(base);
    expect(results.map((r) => r.problems)).toEqual(Array(ROUTES.length).fill(["status 404"]));
  });

  test("fetches each og:image exactly as emitted, hash query included", async () => {
    const stub = serve(base, "/");
    await checkSite(base);
    const fetched = stub.mock.calls.map(([url]) => String(url));
    expect(fetched).toEqual(
      expect.arrayContaining([
        "https://example.org/opengraph-image?abc123",
        "https://example.org/elections/2026-11-03-general/opengraph-image?abc123",
        "https://example.org/meetings/opengraph-image?abc123",
        "https://example.org/about/opengraph-image?abc123",
      ]),
    );
  });

  test("rejects an og:image on another origin without fetching it", async () => {
    const stub = serve(base, "/meetings", { tags: { "og:image": "https://elsewhere.example/card.png" } });
    expect(await problemsFor(base, "/meetings")).toEqual([
      "og:image https://elsewhere.example/card.png is not an absolute URL on https://example.org",
    ]);
    expect(stub.mock.calls.map(([url]) => String(url))).not.toContain("https://elsewhere.example/card.png");
  });

  test("rejects an og:image on the same host under another scheme", async () => {
    serve(base, "/meetings", { tags: { "og:image": "http://example.org/meetings/opengraph-image" } });
    expect(await problemsFor(base, "/meetings")).toEqual([
      "og:image http://example.org/meetings/opengraph-image is not an absolute URL on https://example.org",
    ]);
  });

  test("reports an og:image that responds with a non-PNG content-type", async () => {
    serve(base, "/elections/2026-11-03-general", {
      image: () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    });
    expect(await problemsFor(base, "/elections/2026-11-03-general")).toEqual([
      "og:image https://example.org/elections/2026-11-03-general/opengraph-image?abc123 content-type is text/html, expected image/png",
    ]);
  });

  test("accepts an image/png content-type with parameters", async () => {
    serve(base, "/elections/2026-11-03-general", {
      image: () =>
        new Response(pngHeader(1200, 630), {
          status: 200,
          headers: { "content-type": "image/png; charset=binary" },
        }),
    });
    expect(await problemsFor(base, "/elections/2026-11-03-general")).toEqual([]);
  });

  test("reports an og:image that responds with a non-200 status", async () => {
    serve(base, "/elections/2026-11-03-general", { image: () => new Response("", { status: 500 }) });
    expect(await problemsFor(base, "/elections/2026-11-03-general")).toEqual([
      "og:image https://example.org/elections/2026-11-03-general/opengraph-image?abc123 status 500",
    ]);
  });

  test("reports an og:image whose PNG is the wrong size", async () => {
    serve(base, "/about", {
      image: () =>
        new Response(pngHeader(600, 315), { status: 200, headers: { "content-type": "image/png" } }),
    });
    expect(await problemsFor(base, "/about")).toEqual([
      "og:image https://example.org/about/opengraph-image?abc123 is 600x315, expected 1200x630",
    ]);
  });

  test("reports an og:image whose body is not a PNG", async () => {
    serve(base, "/about", {
      image: () => new Response("nope", { status: 200, headers: { "content-type": "image/png" } }),
    });
    expect(await problemsFor(base, "/about")).toEqual([
      "og:image https://example.org/about/opengraph-image?abc123 is not a PNG",
    ]);
  });
});

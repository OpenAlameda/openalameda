// Checks what a link-preview crawler sees: the raw server HTML, no JavaScript.
// Runs under Vitest and under Node's native type stripping (scripts/check-site.ts),
// so it imports no app code, only helpers that Node can also strip (by their .ts paths),
// and uses only erasable TypeScript syntax.

import { pngSize } from "../lib/png-size.ts";

export const ROUTES = [
  "/",
  "/elections/2026-11-03-general",
  "/elections/2026-11-03-general/mayor",
  "/elections/2026-11-03-general/measure-l",
  "/elections/2026-11-03-general/mayor/tony-daysog",
  "/elections/2026-11-03-general/city-council/marcie-johnson?from=alameda&type=individual",
  "/meetings",
  "/about",
] as const;

export type RouteResult = { route: string; problems: string[] };

export type CheckOptions = {
  /**
   * Check that og:image is present, absolute on the site's origin, and serves
   * a 1200x630 PNG. Defaults to true.
   */
  checkImages?: boolean;
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] !== "#") return ENTITIES[body.toLowerCase()] ?? entity;
    const hex = body[1] === "x" || body[1] === "X";
    return String.fromCodePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}

/** Parses the attributes of every `<tag ...>` in `html`. */
function tags(html: string, tag: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  for (const [, attrText] of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))) {
    const attrs: Record<string, string> = {};
    for (const [, name, dq, sq] of attrText.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[name.toLowerCase()] = decode(dq ?? sq);
    }
    found.push(attrs);
  }
  return found;
}

/**
 * Finds a `<meta name=key>` or `<meta property=key>` content value, or the
 * `<link rel="canonical">` href when `key` is "canonical".
 */
export function findMeta(html: string, key: string): string | undefined {
  if (key === "canonical") {
    return tags(html, "link").find((a) => a.rel === "canonical")?.href;
  }
  return tags(html, "meta").find((a) => a.name === key || a.property === key)?.content;
}

function findTitle(html: string): string | undefined {
  const match = /<title\b[^>]*>([^<]*)<\/title>/i.exec(html);
  return match ? decode(match[1]) : undefined;
}

function problemsIn(html: string, expectedUrl: URL): string[] {
  const problems: string[] = [];

  if (!findTitle(html)?.trim()) problems.push("missing <title>");
  for (const key of ["description", "og:title", "og:description"]) {
    if (!findMeta(html, key)?.trim()) problems.push(`missing ${key}`);
  }

  const card = findMeta(html, "twitter:card");
  if (card !== "summary_large_image") {
    problems.push(`twitter:card is ${card ?? "missing"}, expected summary_large_image`);
  }

  // Compared as parsed absolute URLs: Next writes the root canonical without
  // its trailing slash, which names the same URL.
  const canonical = findMeta(html, "canonical");
  if (!canonical || !URL.canParse(canonical) || new URL(canonical).href !== expectedUrl.href) {
    problems.push(`canonical is ${canonical ?? "missing"}, expected ${expectedUrl.href}`);
  }

  return problems;
}

/**
 * Checks that the page's og:image is on the site's origin and serves a
 * 1200x630 PNG. The URL is fetched exactly as emitted, including the hash
 * query Next appends to opengraph-image URLs.
 */
async function imageProblems(html: string, base: URL): Promise<string[]> {
  const image = findMeta(html, "og:image");
  if (!image?.trim()) return ["missing og:image"];
  if (!URL.canParse(image) || new URL(image).origin !== base.origin) {
    return [`og:image ${image} is not an absolute URL on ${base.origin}`];
  }

  let res: Response;
  try {
    res = await fetch(new URL(image), { redirect: "manual" });
  } catch (error) {
    return [`og:image ${image} fetch failed: ${failureReason(error)}`];
  }
  if (res.status !== 200) {
    await res.body?.cancel();
    return [`og:image ${image} status ${res.status}`];
  }
  const type = res.headers.get("content-type");
  if (type?.split(";")[0].trim().toLowerCase() !== "image/png") {
    await res.body?.cancel();
    return [`og:image ${image} content-type is ${type ?? "missing"}, expected image/png`];
  }
  const size = pngSize(new Uint8Array(await res.arrayBuffer()));
  if (!size) return [`og:image ${image} is not a PNG`];
  if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) {
    return [`og:image ${image} is ${size.width}x${size.height}, expected ${CARD_WIDTH}x${CARD_HEIGHT}`];
  }
  return [];
}

/** Node's fetch throws a generic "fetch failed" and keeps the reason in `cause`. */
function failureReason(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) return "code" in cause ? String(cause.code) : cause.message;
  return error instanceof Error ? error.message : String(error);
}

async function checkRoute(base: URL, route: string, opts: Required<CheckOptions>): Promise<string[]> {
  const url = new URL(route, base);
  let res: Response;
  try {
    // Redirects count as problems: the canonical URL itself must serve the page.
    res = await fetch(url, { redirect: "manual" });
  } catch (error) {
    return [`fetch failed: ${failureReason(error)}`];
  }
  // A non-200 page's tags belong to the error page, so checking them adds only noise.
  if (res.status !== 200) return [`status ${res.status}`];
  const html = await res.text();
  const problems = problemsIn(html, url);
  if (opts.checkImages) problems.push(...(await imageProblems(html, base)));
  return problems;
}

/**
 * Parses `baseUrl`, which must be a bare origin: routes resolve from the site
 * root, so a path would be silently dropped.
 */
export function parseBaseUrl(baseUrl: string): URL {
  if (!URL.canParse(baseUrl)) throw new Error(`Base URL ${baseUrl} is not an absolute URL.`);
  const base = new URL(baseUrl);
  if (base.pathname !== "/" || base.search || base.hash) {
    throw new Error(`Base URL ${baseUrl} must be an origin, such as ${base.origin}, with no path.`);
  }
  return base;
}

/** Checks every route's raw HTML for the full share-preview metadata set, and each preview image. */
export async function checkSite(baseUrl: string, opts: CheckOptions = {}): Promise<RouteResult[]> {
  const base = parseBaseUrl(baseUrl);
  const options = { checkImages: opts.checkImages ?? true };
  return Promise.all(
    ROUTES.map(async (route) => ({ route, problems: await checkRoute(base, route, options) })),
  );
}

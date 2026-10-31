// Checks what a link-preview crawler sees: the raw server HTML, no JavaScript.
// Runs under Vitest and under Node's native type stripping (scripts/check-site.ts),
// so it imports nothing from the app and uses only erasable TypeScript syntax.

export const ROUTES = ["/", "/elections", "/meetings", "/about"] as const;

export type RouteResult = { route: string; problems: string[] };

export type CheckOptions = {
  /** Check that og:image is present and absolute on the site's host. */
  checkImages?: boolean;
};

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

function problemsIn(html: string, expectedUrl: URL, opts: CheckOptions): string[] {
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

  if (opts.checkImages) {
    const image = findMeta(html, "og:image");
    if (!image?.trim()) {
      problems.push("missing og:image");
    } else if (!URL.canParse(image) || new URL(image).host !== expectedUrl.host) {
      problems.push(`og:image ${image} is not an absolute URL on ${expectedUrl.host}`);
    }
  }

  return problems;
}

/** Node's fetch throws a generic "fetch failed" and keeps the reason in `cause`. */
function failureReason(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) return "code" in cause ? String(cause.code) : cause.message;
  return error instanceof Error ? error.message : String(error);
}

async function checkRoute(base: URL, route: string, opts: CheckOptions): Promise<string[]> {
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
  return problemsIn(await res.text(), url, opts);
}

/** Checks every route's raw HTML for the full share-preview metadata set. */
export async function checkSite(baseUrl: string, opts: CheckOptions = {}): Promise<RouteResult[]> {
  const base = new URL(baseUrl);
  const options = { checkImages: false, ...opts };
  return Promise.all(
    ROUTES.map(async (route) => ({ route, problems: await checkRoute(base, route, options) })),
  );
}

/**
 * Resolves the site's canonical origin, in precedence order: an explicit
 * SITE_URL, the Vercel production domain, the Vercel deployment host for
 * previews, then localhost for local development. Reads only from `env` so
 * tests can pass plain objects.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const { SITE_URL, VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL } = env;

  if (SITE_URL) return new URL(SITE_URL);
  if (VERCEL_ENV === "production" && VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  // Vercel hostnames carry no scheme.
  if (VERCEL_ENV && VERCEL_URL) return new URL(`https://${VERCEL_URL}`);
  return new URL("http://localhost:3000");
}

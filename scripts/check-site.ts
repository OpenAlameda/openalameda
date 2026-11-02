// Usage: pnpm check-site <baseUrl>
// Prints one line per route, "ok" or its problems, and exits 1 if any route has one.
// Runs on Node's native type stripping, hence the .ts import extension.
import { checkSite, parseBaseUrl } from "../src/check/check-site.ts";

const baseUrl = process.argv[2];
try {
  if (!baseUrl) throw new Error("Missing base URL.");
  parseBaseUrl(baseUrl);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Usage: pnpm check-site <baseUrl>, for example https://openalameda.org");
  process.exit(2);
}

const results = await checkSite(baseUrl);
for (const { route, problems } of results) {
  console.log(`${route} ${problems.length ? problems.join("; ") : "ok"}`);
}
process.exitCode = results.some((r) => r.problems.length) ? 1 : 0;

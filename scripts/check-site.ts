// Usage: pnpm check-site <baseUrl>
// Prints one line per route, "ok" or its problems, and exits 1 if any route has one.
// Runs on Node's native type stripping, hence the .ts import extension.
import { checkSite } from "../src/check/check-site.ts";

const baseUrl = process.argv[2];
if (!baseUrl || !URL.canParse(baseUrl)) {
  console.error("Usage: pnpm check-site <baseUrl>, for example https://openalameda.org");
  process.exit(2);
}

const results = await checkSite(baseUrl);
for (const { route, problems } of results) {
  console.log(`${route} ${problems.length ? problems.join("; ") : "ok"}`);
}
process.exitCode = results.some((r) => r.problems.length) ? 1 : 0;

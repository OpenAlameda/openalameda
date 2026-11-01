// Usage: pnpm ingest <slug> --collected YYYY-MM-DD
// Reads data/raw/<slug>/ (manifest.tsv, efile .xls exports, transcribed paper filings) and the hand-kept
// files in data/elections/<slug>/, then writes data/elections/<slug>/finance.json and tmp/ingest-<slug>.log.
// Runs on Node's native type stripping, hence the .ts import extensions.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { RacesFile } from "../src/elections/types.ts";
import { applyCorrections, parseCorrections } from "../src/ingest/corrections.ts";
import { crossCheck, ingest, serializeFinance } from "../src/ingest/ingest.ts";
import type { Attribution } from "../src/ingest/outside.ts";
import { filerKey, parseManifest, parseSummary, parseTsv, toCalRows } from "../src/ingest/raw.ts";
import type { LoadedFiling } from "../src/ingest/select.ts";

function usage(message: string): never {
  console.error(message);
  console.error(
    "Usage: pnpm ingest <slug> --collected YYYY-MM-DD, for example 2026-11-03-general --collected 2026-10-31",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const slug = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--collected");
const collectedAt = args.indexOf("--collected");
const collectedOn = collectedAt >= 0 ? args[collectedAt + 1] : undefined;
if (!slug) usage("Missing election slug.");
if (!collectedOn || !/^\d{4}-\d{2}-\d{2}$/.test(collectedOn)) usage("Missing or malformed --collected date.");

const rawDir = join("data", "raw", slug);
const electionDir = join("data", "elections", slug);
const xlsDir = join("tmp", "xls", slug);
if (!existsSync(join(rawDir, "manifest.tsv"))) usage(`No manifest at ${join(rawDir, "manifest.tsv")}.`);
mkdirSync(xlsDir, { recursive: true });

/** TSV text of an efile export, converting it with xlrd unless the cached TSV is newer. */
function xlsText(xlsPath: string): string {
  const out = join(xlsDir, `${basename(xlsPath, ".xls")}.tsv`);
  if (!existsSync(out) || statSync(out).mtimeMs < statSync(xlsPath).mtimeMs) {
    execFileSync(
      "uv",
      [
        "run",
        "--no-project",
        "--with",
        "xlrd==2.0.1",
        "python",
        "-I",
        join("scripts", "xls-to-tsv.py"),
        xlsPath,
        out,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  }
  return readFileSync(out, "utf8");
}

/** Records with any repeated header line dropped (transcriptions sometimes paste the header twice). */
function records(text: string): Record<string, string>[] {
  return parseTsv(text).filter((r) => !Object.entries(r).every(([k, v]) => v.trim() === k.trim()));
}

const manifest = parseManifest(readFileSync(join(rawDir, "manifest.tsv"), "utf8"));
const readLog: string[] = [];
const sources: {
  entry: (typeof manifest)[number];
  source: "efile" | "paper";
  summaryPath: string | null;
  records: Record<string, string>[];
}[] = [];
for (const entry of manifest) {
  let text: string;
  let summaryPath: string | null = null;
  let source: "efile" | "paper";
  if (/\.xls$/i.test(entry.path)) {
    text = xlsText(join(rawDir, entry.path));
    source = "efile";
  } else if (/^pdf\/.+\.pdf$/i.test(entry.path) || /^transcribed\/.+\.tsv$/i.test(entry.path)) {
    // Paper filings are read from their transcription, which shares the PDF's stem.
    const stem = basename(entry.path).replace(/\.(pdf|tsv)$/i, "");
    const tsv = join(rawDir, "transcribed", `${stem}.tsv`);
    if (!existsSync(tsv)) {
      readLog.push(`no transcription for ${entry.path}: not read`);
      continue;
    }
    text = readFileSync(tsv, "utf8");
    const summary = join(rawDir, "transcribed", `${stem}.summary.tsv`);
    summaryPath = existsSync(summary) ? summary : null;
    source = "paper";
  } else {
    // viewer-only, paper-not-downloaded and the like: no transactions to read.
    continue;
  }
  sources.push({ entry, source, summaryPath, records: records(text) });
}

// Corrections overlay the records read above, before any row is counted; raw files are never written.
const correctionsPath = join(electionDir, "corrections.json");
const corrections = parseCorrections(
  existsSync(correctionsPath) ? JSON.parse(readFileSync(correctionsPath, "utf8")) : undefined,
);
const corrected = applyCorrections(
  sources.map((s) => ({ path: s.entry.path, records: s.records })),
  corrections,
  readLog,
);
const filings: LoadedFiling[] = sources.map((s, i) => {
  const rows = toCalRows(s.entry.path, corrected[i].records, s.source);
  return {
    entry: s.entry,
    filerKey: rows[0]?.filerKey ?? filerKey("", s.entry.filer),
    filerName: rows[0]?.filerName ?? s.entry.filer,
    rows,
    summary: s.summaryPath ? parseSummary(readFileSync(s.summaryPath, "utf8")) : null,
  };
});

const races = JSON.parse(readFileSync(join(electionDir, "races.json"), "utf8")) as RacesFile;
const zips = JSON.parse(readFileSync(join("data", "geo", "alameda-county-zips.json"), "utf8")) as {
  zips: string[];
};
const attributionsPath = join(electionDir, "outside-attributions.json");
const attributions = existsSync(attributionsPath)
  ? (JSON.parse(readFileSync(attributionsPath, "utf8")) as Record<string, Attribution>)
  : {};

const { finance, log } = ingest({
  filings,
  manifest,
  races,
  attributions,
  corrections,
  countyZips: new Set(zips.zips),
  collectedOn,
});

const indexFiles = readdirSync(rawDir)
  .filter((f) => /^advanced-.*\.xls$/i.test(f))
  .sort();
const check =
  indexFiles.length === 0
    ? ["cross-check skipped: no advanced-*.xls index export in the raw folder"]
    : crossCheck(
        indexFiles.flatMap((f) => records(xlsText(join(rawDir, f)))),
        finance,
        races,
      );

writeFileSync(join(electionDir, "finance.json"), serializeFinance(finance));
const logPath = join("tmp", `ingest-${slug}.log`);
writeFileSync(
  logPath,
  [...readLog, ...log, "", "# Totals cross-check (a report, not an assertion)", ...check, ""].join("\n"),
);
console.log(
  `wrote ${join(electionDir, "finance.json")} and ${logPath} (${log.length + readLog.length} log lines)`,
);

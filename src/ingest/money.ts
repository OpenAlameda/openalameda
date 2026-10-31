// One candidate's or measure side's money summary from its counted filings (spec ingest rules 3, 5–8
// and 11; data rulings D4, D6, D11, D12). Pure: the log is the only side channel.
// Erasable TypeScript only so Node can run it with type stripping.
import {
  BANDS,
  DONOR_TYPES,
  LOCALITIES,
  type Band,
  type BandCents,
  type Candidate,
  type DonorType,
  type Locality,
  type Matrix,
  type MoneySummary,
  type ReportedDiff,
} from "../elections/types.ts";
import type { CalRow } from "./raw.ts";
import type { LoadedFiling } from "./select.ts";

const ALAMEDA_ZIPS = new Set(["94501", "94502"]);

/** Null means the ZIP is missing or malformed; callers count that as "other". */
export function locality(zip5: string | null, countyZips: Set<string>): Locality | null {
  if (zip5 === null) return null;
  if (ALAMEDA_ZIPS.has(zip5)) return "alameda";
  return countyZips.has(zip5) ? "county" : "other";
}

const KNOWN_TYPES: Record<string, DonorType> = {
  IND: "individual",
  OTH: "organization",
  COM: "political",
  PTY: "political",
  SCC: "political",
};

/** Donor type from `Entity_Cd`; unknown codes read as organization (summarize logs them). */
export function donorType(entityCd: string): DonorType {
  return KNOWN_TYPES[entityCd.trim().toUpperCase()] ?? "organization";
}

export function band(cents: number): Band {
  if (cents >= 100000) return "1000+";
  if (cents >= 50000) return "500-999";
  if (cents >= 25000) return "250-499";
  if (cents >= 10000) return "100-249";
  return "under-100";
}

const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/ +/g, " ")
    .trim();

/** `legalName` is "Last, First"; each part must equal the contributor's after normalizing. */
export function namesMatch(legalName: string, last: string, first: string): boolean {
  const comma = legalName.indexOf(",");
  if (comma < 0) return false;
  const wantLast = nameKey(legalName.slice(0, comma));
  const wantFirst = nameKey(legalName.slice(comma + 1));
  if (!wantLast || !wantFirst) return false;
  return nameKey(last) === wantLast && nameKey(first) === wantFirst;
}

const squash = (s: string) => s.trim().replace(/\s+/g, " ");

const emptyBands = (): BandCents => Object.fromEntries(BANDS.map((b) => [b, 0])) as BandCents;

function byCell<T>(make: () => T): Record<Locality, Record<DonorType, T>> {
  return Object.fromEntries(
    LOCALITIES.map((l) => [l, Object.fromEntries(DONOR_TYPES.map((t) => [t, make()]))]),
  ) as Record<Locality, Record<DonorType, T>>;
}

const RAISED_FORMS = new Set(["A", "C"]);
const SPENT_FORMS = new Set(["E", "F450P5"]);
const ROUNDING_CENTS = 200;

/** Summary lines checked against schedule sums (D12). */
const SUMMARY_CHECKS: { line: number; label: string; forms: string[] }[] = [
  { line: 1, label: "Monetary contributions", forms: ["A"] },
  { line: 2, label: "Loans received", forms: ["B1"] },
  { line: 4, label: "Nonmonetary contributions", forms: ["C"] },
  { line: 6, label: "Payments made", forms: ["E"] },
  { line: 10, label: "Nonmonetary adjustment", forms: ["C"] },
];

/** A committee's latest period report: latest thru date, then latest filed. */
function latestPerFiler(filings: LoadedFiling[]): LoadedFiling[] {
  const latest = new Map<string, LoadedFiling>();
  for (const f of filings) {
    const held = latest.get(f.filerKey);
    const thru = f.entry.period?.thru ?? "";
    const heldThru = held?.entry.period?.thru ?? "";
    if (!held || thru > heldThru || (thru === heldThru && f.entry.filed > held.entry.filed))
      latest.set(f.filerKey, f);
  }
  return [...latest.values()];
}

export function summarize(
  input: { filings: LoadedFiling[]; late: CalRow[]; candidate: Candidate | null; countyZips: Set<string> },
  log: string[],
): MoneySummary {
  const { filings, candidate, countyZips } = input;
  const late = input.late.filter((r) => r.formType === "F497P1" && !r.memo);
  const who = candidate ? candidate.slug : (filings[0]?.filerName ?? "measure side");

  const matrix: Matrix = byCell(() => ({ cents: 0, count: 0 }));
  const bandsByCell = byCell(emptyBands);
  const bands = emptyBands();
  let raisedCents = 0;
  let spentCents = 0;
  let ownCents = 0;
  let carriedCents = 0;
  let contributionCount = 0;
  let unknownLocalityCents = 0;
  const unknownCodes = new Map<string, number>();

  const prior = candidate?.priorCommittees ?? [];
  const priorIds = new Set(prior.flatMap((c) => (c.id ? [c.id] : [])));
  const priorNames = new Set(prior.flatMap((c) => [c.name, ...(c.aliases ?? [])].map(squash)));
  const isCandidate = (r: CalRow) =>
    candidate !== null && namesMatch(candidate.legalName, r.entityLast, r.entityFirst);

  const contribution = (r: CalRow) => {
    raisedCents += r.cents;
    const label = `${r.file} ${r.tranId}`;
    if (priorIds.has(r.cmteId.trim()) || priorNames.has(squash(r.entityLast))) {
      carriedCents += r.cents;
      log.push(`${who}: carried over ${r.cents} cents from ${squash(r.entityLast)} (${label})`);
      return;
    }
    if (isCandidate(r)) {
      ownCents += r.cents;
      log.push(`${who}: own money ${r.cents} cents (${label})`);
      return;
    }
    if (candidate) {
      const comma = candidate.legalName.indexOf(",");
      if (comma > 0 && nameKey(r.entityLast) === nameKey(candidate.legalName.slice(0, comma))) {
        log.push(`${who}: near miss on the candidate's name, counted as from others (${label})`);
      }
    }
    const code = r.entityCd.trim().toUpperCase();
    if (!(code in KNOWN_TYPES)) unknownCodes.set(code, (unknownCodes.get(code) ?? 0) + 1);
    const where = locality(r.zip5, countyZips);
    if (where === null) unknownLocalityCents += r.cents;
    const cell = matrix[where ?? "other"][donorType(code)];
    cell.cents += r.cents;
    if (r.cents < 0) {
      log.push(`${who}: negative contribution ${r.cents} cents, out of bands and counts (${label})`);
      return;
    }
    if (r.cents === 0) {
      log.push(`${who}: zero-amount contribution, out of bands and counts (${label})`);
      return;
    }
    cell.count += 1;
    contributionCount += 1;
    const b = band(r.cents);
    bands[b] += r.cents;
    bandsByCell[where ?? "other"][donorType(code)][b] += r.cents;
  };

  for (const f of filings) {
    for (const r of f.rows) {
      if (r.memo) continue;
      if (RAISED_FORMS.has(r.formType)) contribution(r);
      else if (SPENT_FORMS.has(r.formType)) spentCents += r.cents;
      else if (r.formType === "B1" && r.amtForgCents) {
        if (isCandidate(r)) {
          ownCents += r.amtForgCents;
          raisedCents += r.amtForgCents;
          log.push(
            `${who}: own money ${r.amtForgCents} cents, forgiven candidate loan (${r.file} ${r.tranId})`,
          );
        } else {
          log.push(`${who}: forgiven loan from a non-candidate lender not counted (${r.file} ${r.tranId})`);
        }
      }
    }
  }
  for (const r of late) contribution(r);
  for (const [code, n] of unknownCodes) {
    log.push(`${who}: unknown Entity_Cd "${code}" on ${n} rows, counted as organization`);
  }

  let loansFromCandidateCents = 0;
  let otherLoansCents = 0;
  for (const f of latestPerFiler(filings)) {
    for (const r of f.rows) {
      if (r.memo || r.formType !== "B1") continue;
      const outstanding = r.amtCloseCents ?? r.cents;
      if (isCandidate(r)) loansFromCandidateCents += outstanding;
      else otherLoansCents += outstanding;
    }
  }

  const reportedDiffs: ReportedDiff[] = [];
  for (const f of filings) {
    if (!f.summary) continue;
    for (const check of SUMMARY_CHECKS) {
      const line = f.summary.find((l) => l.line === check.line);
      if (!line) {
        log.push(`${f.entry.path}: summary line ${check.line} missing, not checked`);
        continue;
      }
      const reportedCents = line.colACents ?? 0;
      const scheduleCents = f.rows
        .filter((r) => !r.memo && check.forms.includes(r.formType))
        .reduce((sum, r) => sum + r.cents, 0);
      const diff = Math.abs(reportedCents - scheduleCents);
      if (diff >= ROUNDING_CENTS) {
        reportedDiffs.push({
          filed: f.entry.filed,
          line: check.line,
          label: line.label || check.label,
          reportedCents,
          scheduleCents,
        });
        log.push(
          `${f.entry.path}: summary line ${check.line} reports ${reportedCents} cents, schedules sum to ${scheduleCents}`,
        );
      } else if (diff > 0) {
        log.push(`${f.entry.path}: summary line ${check.line} off by ${diff} cents, filer rounding`);
      }
    }
  }

  const status: MoneySummary["status"] =
    filings.length > 0 || late.length > 0 ? "filed" : candidate?.shortForm ? "short-form" : "no-filings";
  const paper = filings.some((f) => f.summary !== null || f.rows.some((r) => r.source === "paper"));

  return {
    status,
    paper,
    raisedCents,
    spentCents,
    ownCents,
    carriedCents,
    loansFromCandidateCents,
    otherLoansCents,
    contributionCount,
    matrix,
    bands,
    bandsByCell,
    unknownLocalityCents,
    outside: { supportCents: 0, opposeCents: 0 },
    reportedDiffs,
  };
}

# Contributions and Elections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hand-collected City of Alameda campaign filings for the November 3, 2026 general election into committed JSON, and show it as shareable election, race and candidate pages.

**Architecture:** A local ingest (`pnpm ingest <slug>`) converts the legacy `.xls` exports to TSV with a small Python step, applies the spec's counting rules in plain TypeScript, and writes `data/elections/<slug>/finance.json`. The Next.js app reads only committed JSON through a static registry, renders every number on the server, and gives each page its own `next/og` preview card.

**Tech Stack:** Next.js 16.4.3 App Router, React 19.3, TypeScript, Tailwind v4, Vitest 5, `next/og`, Node 24 type stripping for scripts, Python `xlrd` 2.0.1 through `uv` for `.xls` conversion.

**Spec:** `docs/specs/contributions-and-elections.md`

## Global Constraints

- Ship order if time runs short: ingest + election page → race pages → candidate pages → heatmap filters. Each task below leaves the site deployable.
- No individual contributor's name, employer or occupation appears on any page or in any committed file. Organizations, committees and candidates may be named.
- Raw files stay in `data/raw/<slug>/` (gitignored, a symlink to the maintainer's raw folder). The ingest log goes to `tmp/ingest-<slug>.log` (gitignored).
- Money is integer cents everywhere in code and JSON. Pages show whole dollars: `$13,620`.
- Percentages round to the nearest whole number; a nonzero share that rounds to 0 shows `<1%`.
- Fetching anything from the web (acvote, Ballotpedia, census.gov, CampaignDocs): serial requests, several seconds apart, a single fetch per link check, never a crawl. Stop and report on any 403, 429, block page or CAPTCHA.
- Scripts and everything they import (`scripts/*.ts`, `src/ingest/**`, `src/elections/types.ts`) use only erasable TypeScript syntax and import siblings by their `.ts` paths, as `src/check/check-site.ts` does.
- Every new page: title, description, canonical, 1200×630 preview card through `withFallback` from `src/og/card.tsx`; phones first, one wider desktop layout.
- Copy fixed by the spec, verbatim: "No campaign finance filings on record with the City." · "Filed a short form: expects to raise and spend under $2,000. No committee." · "No campaign finance filings on record with the City for either side." · bands `$1,000+`, `$500–999`, `$250–499`, `$100–249`, `Under $100 (itemized)`.
- Source line: "City of Alameda campaign disclosures, itemized contributions, data through <date>, collected <date>. How we count." ("How we count" links to `/about#methodology--disclosures`.)
- Slice URL contract: `?from=alameda|county|other` and `?type=individual|organization|political`; unknown values are ignored.
- AGENTS.md conventions: one command per tool call, scratch in `./tmp`, type-prefixed imperative commits, Markdown not hard-wrapped, the pre-commit path check must print nothing.
- Commit messages end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and no session link.

## Review Focus

1. A filer with zero itemized contributions from others (Measure L No; any committee whose only money is the candidate's own) must show "No itemized contributions from others." instead of `NaN%`, an empty grid or a divide-by-zero. Test in Task 5.
2. Bad slice URLs — `?from=mars`, `?type=`, repeated `?from=alameda&from=county` — must render the full view with the plain canonical, never a 500. Test in Task 5 (`parseSlice`) and Task 8 (e2e).
3. Unknown election, race or candidate slugs must 404 inside the site frame. Test in Tasks 6–8 (e2e).
4. Long names (Thushan Amarasiriwardena, "Alameda Climate Change Belivers Opposing Measure L 2026") must not overflow cards or preview images. Test in Task 5 (the card helpers clamp) and by eye in each page task's screenshot step.
5. Key dates computed at build time go stale: the election page must re-evaluate "past" and "next" at least hourly in `America/Los_Angeles`. Test in Task 5 (`keyDateStates` at boundaries) and Task 6 (`revalidate = 3600`).

---

## Data rulings (from the raw-data survey, 10/31)

These settle questions the spec leaves to the builder. Tasks cite them by number.

2026-10-31: D4, D6 and D12 revised after the real-data review (forgiven loans, late loans, paper diff labels).

- **D1 Form and amendment** come from `manifest.tsv`. Columns (tab-separated, no header): path, filer name, form (`460`, `460-A`, `450`, `460-T`, `496`, `496-A`, `497`), amendment number, filed date `MM/DD/YYYY`, period `M/D/YYYY - M/D/YYYY` (or `-`), note. Rows whose path is `viewer-only` or `paper-not-downloaded` are not files. Form family strips `-A`.
- **D2 Period key** is (filer key, form family, period thru date from the manifest). The manifest period is used even for zero-row paper filings; a row `Thru_Date` that disagrees is logged.
- **D3 Filer key** is `Filer_ID` when it is all digits, otherwise `name:<Filer_Nam L>` (some exports leave `Filer_ID` blank; the paper IAFF 496 says `Pending`). A filing belongs to a races.json committee when its numeric `Filer_ID` equals the committee `id`, or, when it has no numeric ID, its filer name equals the committee `name` or one of its `aliases`.
- **D4 Counted rows.** Raised: `Form_Type` `A` and `C`, plus counted `F497P1` rows except loans: a `F497P1` row whose `Tran_ID` starts with `LN` is a loan received (the export leaves `Loan_TYPE` and `Tran_Type` blank) and is handled under D6. Spent: `E` and `F450P5`. Not counted: `G` (agent payments, already inside E), `F` (accrued), `I`, `D` (duplicated on E), `F497P2`. Memo rows never count; `Memo_Code` is memo unless it is empty, `NO` or `N` (case-insensitive).
- **D5 Late reports.** A `F497P1` or `F496` row counts only if `Tran_Date` is after the latest period thru date of the same filer key (all its period reports count, any family); with no period report it counts. Duplicates by (filer key, `Tran_ID`) keep the latest-filed copy.
- **D6 Loans.** Outstanding loans = sum of `Amt_Close` (falling back to `Amount` when blank) over `B1` rows on the committee's latest period report. Lender matched to the candidate's `legalName` → `loansFromCandidateCents`; others → `otherLoansCents`. A counted late `F497P1` loan row (D4) adds its `Amount` to the same two totals by the same lender match, and is kept out of raised, own money, the heatmap, bands and counts; each one is logged. `Amt_Forg` is never added to raised or own money: Form 460 reports a forgiven loan again as a Schedule A contribution, which already counts (as own money when the lender is the candidate). A forgiven amount with no Schedule A row on the same report from the same lender for the same amount is logged and not counted.
- **D7 Outside spending.** Schedule D rows with `Expn_Code` `IND` are independent expenditures (outside spending); `MON` rows are direct contributions and are not. Target: `Cand_Nam L` (+ `Cand_Nam F`), whitespace-normalized, matched to a candidate's ballot name or "First Last" from `legalName`; else `Bal_Num` letter `L` → race `measure-l`. Side from `Sup_Opp_Cd` (`S` support, `O` oppose). A row is never outside spending for its own filer's candidate.
- **D8 496 attribution.** `F496` rows carry no target fields. `data/elections/<slug>/outside-attributions.json` maps `"<filerKey>:<Tran_ID>"` to `{ "targets": [{ "target": "<race>/<candidate|yes|no>", "side": "support"|"oppose", "cents"?: number }], "why": "<what the filing says>" }` or `{ "notLocal": "<what it is>" }`. Without `cents`, an amount splits equally across targets, remainder cents to the first. An entry also overrides D7 matching for a D row. Rows with no entry and no D7 match go to `unmatched`; `notLocal` rows are only logged.
- **D9 Transcribed rows** (`transcribed/*.tsv`, `Source = pdf`) use CAL column names but may omit some (the IAFF 496 uses `Cand_Nam`, `Bal_Num`, `Rpt_Num` and has no `Tran_ID` or `Rec_Type`). Read by header name; a missing column is empty; a missing `Tran_ID` becomes `<file stem>-<row number>`; `Form_Type` `496` reads as `F496`. `*.summary.tsv` holds the form's summary page (`Line`, `Label`, `Col_A_This_Period`, …). The manifest row for `pdf/climate-belivers-460-09242026.pdf` says form `pdf`; fix it to `460` in the raw manifest before the real run.
- **D10 Dates and amounts.** Converter writes Excel date cells as ISO dates and integral numbers without `.0`. Ingest accepts ISO, `M/D/YYYY` and bare Excel serials for date columns. ZIP: first five characters if they are digits, else unknown.
- **D11 Negative contributions** reduce raised and their heatmap cell's dollars, are left out of bands and counts, and are logged.
- **D12 Paper summary check.** For each transcribed period filing with a summary file, compare Col A lines 1↔A, 4↔C, 6↔E and 10↔C (nonmonetary adjustment) to the schedule sums; line 2 (loans received) is not checked, because B1 `Amount` repeats across reports. A blank Col A reads as zero. A difference of $2.00 or more becomes a `reportedDiffs` entry; smaller ones are filer rounding and are logged only. A diff's label is the fixed name of the checked line, never the transcribed label, which may carry transcriber notes.
- **D13 Unread filings** are manifest rows with path `paper-not-downloaded` whose filer belongs to a race's committee (not `priorCommittees`); others are logged. With today's manifest the list is empty.
- **D14 Seats** (verify against the voter guide's "Vote for no more than N"): Mayor 1, City Council 2, School Board 2.

## File structure

```
data/elections.json                                   hand-kept elections list
data/elections/2026-11-03-general/races.json          hand-kept races, candidates, committees
data/elections/2026-11-03-general/outside-attributions.json   hand-kept 496 targets (D8)
data/elections/2026-11-03-general/finance.json        ingest output (committed)
data/geo/alameda-county-zips.json                     County ZIP list with source
scripts/xls-to-tsv.py                                 .xls → TSV converter
scripts/ingest.ts                                     CLI wrapper
src/elections/types.ts                                shared types (app + ingest)
src/elections/focus.ts                                in-focus rule
src/elections/registry.ts                             static imports of committed JSON
src/elections/view.ts                                 pure display derivations
src/ingest/raw.ts                                     manifest, TSV, row normalization
src/ingest/select.ts                                  rules 1–4, D4, D5
src/ingest/money.ts                                   rules 5–8, 11, bands, loans, D11, D12
src/ingest/outside.ts                                 rule 9, D7, D8
src/ingest/ingest.ts                                  pipeline + deterministic serializer
src/components/elections/*.tsx                        Heatmap, RaisedSpent, CandidateMoney, KeyDates, SourceLine
src/og/election-cards.tsx                             satori cards for election, race, candidate
src/app/elections/page.tsx                            redirect or list
src/app/elections/[election]/…                        election, race, candidate routes
```

---

### Task 1: Election data model and hand-kept files

**Files:**
- Create: `src/elections/types.ts`, `src/elections/focus.ts`, `src/elections/focus.test.ts`, `src/elections/registry.ts`, `src/elections/registry.test.ts`, `data/elections.json`, `data/elections/2026-11-03-general/races.json`, `data/geo/alameda-county-zips.json`
- Modify: `.gitignore` (add `data/raw/`)

**Interfaces:**
- Produces (`src/elections/types.ts`, exact):

```ts
export type KeyDate = { date: string; label: string };
export type Links = { ballotpedia?: string; acvote?: string };
export type Election = {
  slug: string; name: string; papersAvailable: string; electionDay: string;
  resultsFinal: string | null; keyDates: KeyDate[]; links: Links;
};
export type Committee = { id: string | null; name: string; aliases?: string[] };
export type Candidate = {
  slug: string; ballotName: string; legalName: string; designation?: string;
  committees: Committee[]; priorCommittees: Committee[];
  shortForm?: { form: string; filed: string };
};
export type MeasureSide = { committees: Committee[] };
export type OfficeRace = { kind: "office"; slug: string; name: string; seats: number; links: Links; candidates: Candidate[] };
export type MeasureRace = { kind: "measure"; slug: string; name: string; title: string; links: Links; sides: { yes: MeasureSide; no: MeasureSide } };
export type Race = OfficeRace | MeasureRace;
export type RacesFile = { election: string; races: Race[] };

export const LOCALITIES = ["alameda", "county", "other"] as const;
export type Locality = (typeof LOCALITIES)[number];
export const DONOR_TYPES = ["individual", "organization", "political"] as const;
export type DonorType = (typeof DONOR_TYPES)[number];
export const BANDS = ["1000+", "500-999", "250-499", "100-249", "under-100"] as const;
export type Band = (typeof BANDS)[number];
export type Cell = { cents: number; count: number };
export type Matrix = Record<Locality, Record<DonorType, Cell>>;
export type BandCents = Record<Band, number>;

export type ReportedDiff = { filed: string; line: number; label: string; reportedCents: number; scheduleCents: number };
export type MoneySummary = {
  status: "filed" | "no-filings" | "short-form";
  paper: boolean;
  raisedCents: number; spentCents: number;
  ownCents: number; carriedCents: number;
  loansFromCandidateCents: number; otherLoansCents: number;
  contributionCount: number;
  matrix: Matrix;
  bands: BandCents;
  bandsByCell: Record<Locality, Record<DonorType, BandCents>>;
  unknownLocalityCents: number;
  outside: { supportCents: number; opposeCents: number };
  reportedDiffs: ReportedDiff[];
};
export type OutsideTotal = { target: string; side: "support" | "oppose"; cents: number };
export type OutsideGroup = { key: string; name: string; totals: OutsideTotal[] };
export type Unmatched = { filerKey: string; filer: string; tranId: string; formType: string; date: string | null; cents: number; description: string };
export type Filing = { filerKey: string; filer: string; form: string; amendment: number; filed: string; period: { from: string; thru: string } | null; source: "efile" | "paper"; file: string };
export type UnreadFiling = { filer: string; form: string; filed: string; period: string; note: string };
export type FinanceFile = {
  election: string; dataThrough: string; collectedOn: string;
  summaries: Record<string, MoneySummary>; // key "<race>/<candidate>" or "<race>/yes" | "<race>/no"
  outsideGroups: OutsideGroup[]; unmatched: Unmatched[]; filings: Filing[]; unreadFilings: UnreadFiling[];
};
```

- Produces (`src/elections/focus.ts`): `isInFocus(e: Election, now: Date): boolean`, `electionInFocus(es: Election[], now: Date): Election | undefined`, `todayInLA(now: Date): string` (ISO date in `America/Los_Angeles`).
- Produces (`src/elections/registry.ts`): `ELECTIONS: Election[]` (newest election day first), `getElection(slug): Election | undefined`, `getRaces(slug): RacesFile | undefined`, `getFinance(slug): FinanceFile | undefined` (undefined until Task 4 commits `finance.json`; import it then), `getRace(election, race): Race | undefined`, `summaryKey(raceSlug, candidateOrSide): string`. JSON is imported statically, one line per election, so Vercel bundles it.

- [ ] **Step 1: Write failing tests** in `src/elections/focus.test.ts` for an election with `papersAvailable: "2026-07-13"`, `electionDay: "2026-11-03"`:
  - `isInFocus` false at `2026-07-05T23:59:00-07:00`, true at `2026-07-06T00:00:00-07:00` (papers − 7 days, LA midnight);
  - with `resultsFinal: "2026-12-03"`: true at `2027-01-02T23:59:00-08:00`, false at `2027-01-03T00:00:00-08:00` (final + 30 days, inclusive through day 30);
  - with `resultsFinal: null`: true on `2027-06-01` (indefinitely after election day);
  - overlap: two elections both in focus → `electionInFocus` returns the earlier `electionDay`;
  - none in focus → `undefined`;
  - `todayInLA(new Date("2026-11-01T06:30:00Z"))` → `"2026-10-31"`.
- [ ] **Step 2:** Run `corepack pnpm test src/elections/focus.test.ts`; expect failures (module missing).
- [ ] **Step 3:** Implement `types.ts` and `focus.ts`. Compare ISO date strings from `todayInLA`; no date library.
- [ ] **Step 4: Fill `data/elections.json`** for `2026-11-03-general`: name `November 3, 2026 General Election`, `resultsFinal: null`, links `ballotpedia` = `https://ballotpedia.org/Municipal_elections_in_Alameda_County,_California_(2026)` and `acvote` = the acvote page for this election (one fetch to confirm it loads; leave it out if it 404s). `papersAvailable` and `keyDates` from the County voter guide text the controller provides and the City Clerk's published calendar: nomination period opens, nomination closes (and extension), first and second pre-election 460 due dates (9/24, 10/22), the 497 24-hour window start, voter registration deadline, election day, County certification (label it "expected" if not fixed). Each date gets a one-line source in the task report, not in the file.
- [ ] **Step 5: Fill `races.json`** in display order Mayor, City Council, School Board, Measure L, M, N, with slugs `mayor`, `city-council`, `school-board`, `measure-l`, `measure-m`, `measure-n`. Candidate slugs are the kebab-case ballot name. Rosters, committees and measure links are in the spec ("Known for 2026-11-03" and "Ballotpedia measure pages"); ballot names and designations come from the voter guide text. Committee IDs from the raw exports:

| Committee | id |
| --- | --- |
| Tracy Jensen for Alameda Mayor 2026 | 1485047 |
| Malia Vella for Alameda Mayor 2026 | 1486162 |
| Daysog for Mayor 2026 | 1492067 |
| Marcie Johnson for Alameda City Council 2026 | 1488958 |
| Thushan Amarasiriwardena for Alameda City Council 2026 | null (exports leave it blank; match by name) |
| Savage for Alameda City Council 2026 | 1492617 |
| Amos White for Alameda City Council 2026 | 1495492 |
| Maria Bondonno for City Council 2026 | 1495863 |
| Donald Scott Means for Alameda City Council 2026 | 1491015 |
| Carrie Hahnel for AUSD Board of Education 2026 | 1491388 |
| Joyce Boyd for Alameda Unified School District Board 2026 | 1487626 |
| Re-Elect Ryan LaLonde for Alameda Unified School Board 2026 | 1493199 |
| Safer Alameda-Yes on Bond Measure L 2026 (alias "SAFER Alameda Yes on L") | 1494405 |
| Alameda Climate Change Belivers Opposing Measure L 2026 | 1496826 |

  Daysog's `priorCommittees`: Daysog for Council 2018 (1404765), Daysog for Council 2022 (1452578). Steve Slauson: no committees, `shortForm: { form: "470-C", filed: "2026-09-14" }`. Gary Lym: no committees. School Board also lists Sarah Putnam and Mike McMahon, who have candidate statements in the County voter guide (pages 647–648) but appear in none of the City's filer lists: no committees. Measures M and N: empty sides. `legalName` is "Last, First" as the candidate signs filings (e.g. "Daysog, Tony").
- [ ] **Step 6: County ZIP list.** Download the Census 2020 ZCTA-to-county relationship file once (gentle rules). Keep each ZCTA whose largest land-area share lies in county FIPS 06001. Write `data/geo/alameda-county-zips.json` as `{ "source": "<file URL>", "rule": "ZCTA whose largest land-area share is in Alameda County (FIPS 06001)", "retrieved": "2026-10-31", "zips": [...] }`, sorted. It must contain `94501`, `94502`, `94601`, `94704`, `94550`, and must not contain `94595` or `94103`.
- [ ] **Step 7: Registry tests** in `src/elections/registry.test.ts`: every race slug is unique; every candidate slug is unique within its race; every committee `id` is digits or null; races are in the display order above; `getRace("2026-11-03-general", "measure-l")?.kind === "measure"`; no committee appears under two candidates or sides.
- [ ] **Step 8:** Implement `registry.ts`; run `corepack pnpm test`; expect all pass. Add `data/raw/` to `.gitignore`, then create the symlink `data/raw/2026-11-03-general` → the raw folder the controller names.
- [ ] **Step 9: Commit** `feat: add elections data model, hand-kept election files and in-focus rule`.

### Task 2: Raw reader and xls converter

**Files:**
- Create: `scripts/xls-to-tsv.py`, `src/ingest/raw.ts`, `src/ingest/raw.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (`src/ingest/raw.ts`):

```ts
export type ManifestEntry = { path: string; filer: string; form: string; family: string; amendment: number; filed: string; period: { from: string; thru: string } | null; note: string };
export type CalRow = {
  file: string; filerKey: string; filerId: string | null; filerName: string;
  recType: string; formType: string; tranId: string;
  entityCd: string; entityLast: string; entityFirst: string; zip5: string | null;
  tranDate: string | null; thruDate: string | null; cents: number;
  amtCloseCents: number | null; amtForgCents: number | null;
  cmteId: string; expnCode: string; description: string;
  candLast: string; candFirst: string; balName: string; balNum: string; supOpp: string;
  memo: boolean; source: "efile" | "paper";
};
export type SummaryLine = { line: number; label: string; colACents: number | null };
export function parseManifest(text: string): ManifestEntry[];
export function parseTsv(text: string): Record<string, string>[];
export function toCalRows(file: string, records: Record<string, string>[], source: "efile" | "paper"): CalRow[];
export function parseSummary(text: string): SummaryLine[];
export function normalizeDate(v: string): string | null;
export function toCents(v: string): number | null;
export function filerKey(id: string, name: string): string;
export function isMemo(code: string): boolean;
```
- `scripts/xls-to-tsv.py <in.xls> <out.tsv>`: first sheet; header row as-is; date cells → ISO; integral numbers without `.0`; tabs and newlines inside cells → spaces.

- [ ] **Step 1: Write failing tests** in `raw.test.ts`:
  - `parseManifest` on three lines (a `460-A` with amendment 1 and period `7/1/2026 - 9/19/2026`; a `497` with period `-`; a `paper-not-downloaded` row) → families `460`, `497`, `460`; `filed` ISO; period `{from:"2026-07-01", thru:"2026-09-19"}` and `null`.
  - A period with a trailing note (`1/1/2026 - 9/19/2026 (cover: 7/1-9/19/2026)`) parses to the first range.
  - `normalizeDate`: `"2026-10-15"`, `"10/15/2026"`, `"46310"` (Excel serial) → ISO; `""` → null.
  - `toCents("500")` 50000, `("31095.44")` 3109544, `("1,250.00")` 125000, `("")` null.
  - `toCalRows` zip: `"94501-1234"` and `"945011234"` → `"94501"`; `"9450"` and `""` → null.
  - `isMemo`: `""`, `"NO"`, `"n"` false; `"X"`, `"Y"` true.
  - `filerKey("1492067", …)` → `"1492067"`; `filerKey("", "Thushan …")` and `filerKey("Pending", "Alameda Firefighters Association IAFF Local 689")` → `"name:…"`.
  - D9: a transcribed record with `Form_Type: "496"`, `Cand_Nam`, `Bal_Num: "L"`, no `Tran_ID` → `formType "F496"`, `balNum "L"`, `tranId "<stem>-1"`.
- [ ] **Step 2:** Run `corepack pnpm test src/ingest/raw.test.ts`; expect failures.
- [ ] **Step 3:** Implement `raw.ts` (pure; no file I/O) and `xls-to-tsv.py`.
- [ ] **Step 4:** Run the tests; expect pass. Convert one real file: `uv run --no-project --with xlrd==2.0.1 python -I scripts/xls-to-tsv.py data/raw/2026-11-03-general/hahnel-497-a0-10212026.xls tmp/xls-check.tsv`, then confirm the header has 88 columns and dates read as ISO.
- [ ] **Step 5: Commit** `feat: read campaign filing exports and the collection manifest`.

### Task 3: Counting rules

**Files:**
- Create: `src/ingest/select.ts`, `src/ingest/money.ts`, `src/ingest/select.test.ts`, `src/ingest/money.test.ts`, `src/ingest/fixtures.ts` (a `row(overrides)` builder returning a valid `CalRow`, and a `manifestEntry(overrides)` builder)

**Interfaces:**
- Consumes: `CalRow`, `ManifestEntry`, `SummaryLine` (Task 2); `Candidate`, `Committee`, `MoneySummary`, `Locality`, `DonorType`, `Band` (Task 1).
- Produces:

```ts
// select.ts
export type LoadedFiling = { entry: ManifestEntry; filerKey: string; filerName: string; rows: CalRow[]; summary: SummaryLine[] | null };
export type Selection = { period: LoadedFiling[]; superseded: LoadedFiling[]; late: CalRow[]; latestThru: Map<string, string> };
export function selectFilings(filings: LoadedFiling[], log: string[]): Selection; // rules 1, 2, 4; D2, D5
export function belongsTo(c: Committee, filerKey: string, filerName: string): boolean; // D3
// money.ts
export function locality(zip5: string | null, countyZips: Set<string>): Locality | null; // null = unknown → counted as "other"
export function donorType(entityCd: string): DonorType;
export function band(cents: number): Band;
export function namesMatch(legalName: string, last: string, first: string): boolean;
export function summarize(input: { filings: LoadedFiling[]; late: CalRow[]; candidate: Candidate | null; countyZips: Set<string> }, log: string[]): MoneySummary;
```

- [ ] **Step 1: Write failing tests** (`select.test.ts`):
  - A `460` and its `460-A` for the same period → only the `-A` rows count, and a row present only in the original is gone (rule 1).
  - Two `460-A` amendments 1 and 3 → amendment 3 wins; ties on amendment break on later `filed`.
  - `497` row dated the same day as the latest thru → not counted; the day after → counted (rule 2). A filer with no period report → counted.
  - The same `Tran_ID` in two `497` files → counted once, from the later-filed file.
  - `belongsTo` by id; by exact name when the row has no numeric id; by alias.
- [ ] **Step 2: Write failing tests** (`money.test.ts`):
  - `locality`: `94501`, `94502` → alameda; a county ZIP → county; `94103` → other; `null` → null, and `summarize` counts that row in `other` and in `unknownLocalityCents`.
  - `donorType`: `IND` individual; `OTH` organization; `COM`, `PTY`, `SCC` political; `XYZ` organization with a log line.
  - `band`: 100000 → `1000+`, 99999 → `500-999`, 50000 → `500-999`, 25000 → `250-499`, 10000 → `100-249`, 9999 → `under-100`.
  - `summarize`: memo `A` row excluded; `G` row excluded from spent; `F450P5` counted in spent; `F` excluded; `C` in raised and in its cell; counted 497 in raised.
  - Own money: `IND` contributor "DAYSOG", "Tony." vs `legalName` "Daysog, Tony" → `ownCents`, in raised, not in `matrix` or `bands`; a near miss ("Daysog", "Anne") is not own money and is logged.
  - Carried over: `Cmte_ID` 1452578, and separately an `Entity_Nam L` exactly "Daysog for Council 2022" → `carriedCents`, out of `matrix` and `bands`.
  - Loans (D6): two period reports with candidate `B1` rows; only the latest report's `Amt_Close` sum is `loansFromCandidateCents`; blank `Amt_Close` falls back to `Amount`; a forgiven loan with a matching Schedule A row counts once, and one without is logged and not counted; a late `F497P1` row with an `LN` `Tran_ID` adds to loans, not raised; a non-candidate lender lands in `otherLoansCents`.
  - D11: a −25000 `A` row reduces raised and its cell's cents, changes no band and no count.
  - D12: a paper filing whose summary line 6 is 3109544 against schedule E sum 3109400 → no diff (under $2.00); line 10 blank against C 200000 → one `reportedDiffs` entry `{line: 10, reportedCents: 0, scheduleCents: 200000}`.
  - `bandsByCell` summed over all cells equals `bands`; `matrix` cents summed equals `raisedCents − ownCents − carriedCents`.
  - `candidate: null` (a measure side) → own and carried are 0.
- [ ] **Step 3:** Run `corepack pnpm test src/ingest`; expect failures.
- [ ] **Step 4:** Implement `select.ts` and `money.ts`. Name matching: lowercase, strip everything but letters and spaces, collapse spaces; last and first must each be equal.
- [ ] **Step 5:** Run the tests; expect pass.
- [ ] **Step 6: Commit** `feat: apply the contribution counting rules`.

### Task 4: Outside spending, the ingest command and the real run

**Files:**
- Create: `src/ingest/outside.ts`, `src/ingest/outside.test.ts`, `src/ingest/ingest.ts`, `src/ingest/ingest.test.ts`, `scripts/ingest.ts`, `data/elections/2026-11-03-general/outside-attributions.json`, `data/elections/2026-11-03-general/finance.json`
- Modify: `package.json` (script `"ingest": "node scripts/ingest.ts"`), `src/elections/registry.ts` (import finance.json)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:

```ts
// outside.ts
export type Attribution = { targets: { target: string; side: "support" | "oppose"; cents?: number }[]; why: string } | { notLocal: string };
export function outsideSpending(input: { selection: Selection; races: RacesFile; attributions: Record<string, Attribution> }, log: string[]): { groups: OutsideGroup[]; unmatched: Unmatched[] };
// ingest.ts
export type IngestInput = { filings: LoadedFiling[]; manifest: ManifestEntry[]; races: RacesFile; attributions: Record<string, Attribution>; countyZips: Set<string>; collectedOn: string };
export function ingest(input: IngestInput): { finance: FinanceFile; log: string[] };
export function serializeFinance(f: FinanceFile): string; // 2-space JSON, trailing newline, arrays sorted, object keys in a fixed order
```
- CLI: `pnpm ingest <slug> --collected YYYY-MM-DD`. Reads `data/raw/<slug>/manifest.tsv`; converts each `.xls` with `uv run --no-project --with xlrd==2.0.1 python -I scripts/xls-to-tsv.py` into `tmp/xls/<slug>/`; reads `transcribed/*.tsv` (and the `.summary.tsv` beside each) for paper rows; writes `finance.json` and `tmp/ingest-<slug>.log`. The `advanced-*.xls` index file is not a filing: it feeds only the cross-check.

- [ ] **Step 1: Write failing tests** (`outside.test.ts`):
  - An outside group's `D` row, `Expn_Code IND`, `Cand_Nam L` "Carrie  Hahnel" (two spaces), `Sup_Opp_Cd S` → support for `school-board/carrie-hahnel`.
  - `IND` with `Bal_Num "L"`, `O` → oppose `measure-l/yes`. (Opposing a measure counts against the Yes side: target `measure-l/yes`, side `oppose`.)
  - `MON` row → not outside spending.
  - A counted `F496` row with an attribution of two targets and no `cents` on 1001 cents → 501 and 500.
  - A `F496` row dated on or before the spender's latest thru → not counted (rule 2).
  - A `F496` row without attribution → in `unmatched`; a `notLocal` attribution → in neither.
  - A candidate committee's own `IND` row about its own candidate → not outside spending.
- [ ] **Step 2: Write failing tests** (`ingest.test.ts`), on a small fixture election (two candidates, one measure, one outside group):
  - A candidate with no committees gets `status "no-filings"` and all zeros; one with `shortForm` gets `"short-form"`.
  - `summaries[...].outside` equals the sums from `outsideGroups`.
  - `dataThrough` = the latest of period thru dates and counted late-report filing dates; `collectedOn` is passed through.
  - `serializeFinance(ingest(x).finance)` is byte-identical across two calls and across a shuffled input order.
  - The serialized output contains none of the fixture's individual contributors' last names.
  - `unreadFilings` follows D13.
- [ ] **Step 3:** Run; expect failures. Implement `outside.ts`, `ingest.ts`, `scripts/ingest.ts`. Run; expect pass.
- [ ] **Step 4: Fill `outside-attributions.json`.** Run `corepack pnpm ingest 2026-11-03-general --collected 2026-10-31` once; every `F496` and unmatched `IND` row is listed in the log with its `Description`. Attribute each from its own description (AEA's 496s name their candidates). Where the description doesn't name a target, leave it unattributed so it stays in `unmatched`, and list it in the task report for the maintainer. No web lookups for this step.
- [ ] **Step 5: Real run.** Fix the manifest form per D9, run the ingest again, and read the log. Check: Daysog for Mayor reports a $26,805 candidate loan; Daysog's own contributions total $6,395; the Measure L No side is `filed` with $0 raised; Steve Slauson is `short-form`; Gary Lym is `no-filings`; Measures M and N have `no-filings` on both sides. Write the totals cross-check (per committee: ingest raised vs. the matching rows of the `advanced-*.xls` index) into the log as a report, not an assertion. If that file's columns can't be matched to a committee, log "cross-check skipped: <reason>".
- [ ] **Step 6:** Run the ingest a second time and `cmp` the two `finance.json` outputs; expect identical. Run `grep -c` on `finance.json` for three individual contributor surnames picked from the log; expect 0.
- [ ] **Step 7:** Import `finance.json` in `registry.ts`; run `corepack pnpm test`; expect pass.
- [ ] **Step 8: Commit** `feat: add the ingest command and the November 2026 finance data`.

### Task 5: Display helpers and shared components

**Files:**
- Create: `src/elections/view.ts`, `src/elections/view.test.ts`, `src/components/elections/Heatmap.tsx`, `src/components/elections/RaisedSpent.tsx`, `src/components/elections/CandidateMoney.tsx`, `src/components/elections/KeyDates.tsx`, `src/components/elections/SourceLine.tsx`, `src/og/election-cards.tsx`

**Interfaces:**
- Consumes: Task 1 types and registry.
- Produces (`view.ts`):

```ts
export type Slice = { from?: Locality; type?: DonorType };
export function othersCents(s: MoneySummary): number;            // sum of matrix cents
export function pct(part: number, whole: number): string;         // "62%", "<1%", "0%"
export function shares(s: MoneySummary): { individuals: string; alameda: string } | null; // null when othersCents is 0
export function topCells(s: MoneySummary, n?: number): { from: Locality; type: DonorType; label: string; pct: string }[]; // nonzero only, largest first
export function cellLabel(from: Locality, type: DonorType): string; // "Alameda individuals", "county organizations", "non-local political"
export function parseSlice(q: Record<string, string | string[] | undefined>): Slice; // arrays or unknown values → field absent
export function sliceQuery(s: Slice): string;                    // "" or "?from=alameda&type=individual" (from first)
export function sliceLabel(s: Slice): string | null;            // see below
export function sliceBands(s: MoneySummary, slice: Slice): BandCents;
export function formatUsd(cents: number): string;                // "$13,620"
export function formatDate(iso: string): string;                 // "October 17, 2026"
export function keyDateStates(dates: KeyDate[], today: string): ("past" | "next" | "future")[];
export function heatOpacity(share: number): number;              // 0 → 0; otherwise 0.08 + 0.92 * share
export function displayName(race: Race, key: string): string;    // ballot name, or "Yes on Measure L" / "No on Measure L"
```
  - `sliceLabel` wording: from `alameda` "from Alameda", `county` "from elsewhere in Alameda County", `other` "from outside Alameda County"; type `individual` "individuals", `organization` "organizations", `political` "political committees". Both → "individuals from Alameda"; type only → "political committees"; from only → "donors from Alameda"; neither → null.
  - Heatmap scale: one absolute scale (a cell's share of that candidate's `othersCents`), teal `#0B6E6E` at `heatOpacity`; zero cells are paper with a border. Rows City of Alameda, Alameda County, Other; columns Individual, Organization, Political.
- Components (props are the implementer's call; these behaviors are fixed):
  - `CandidateMoney`: the race-card block for one candidate or side. Headline raised vs. spent with a thin spent-share bar; split-out lines "$X from the candidate", "$X loaned by the candidate", "$X carried over from an earlier campaign", each only when nonzero; "$X supporting · $Y opposing" from outside groups unless both are zero; `shares` line ("N% from individuals · N% from Alameda"); a small heatmap and the top three cells joined by " · ". `status "no-filings"` shows the spec's no-filings line (the measure version when both sides have none); `"short-form"` shows the short-form line with "Filed <date>."; `paper` adds "from paper filing"; `shares` null shows "No itemized contributions from others."
  - `Heatmap`: plain SVG with accessible text (a `<title>` and a visually hidden table of the nine percentages). Optional `hrefFor(slice)` makes cells and row/column headers links; `selected` outlines the active slice.
  - `KeyDates`: past muted, next highlighted, from `keyDateStates`.
  - `SourceLine`: the Global Constraints copy; an amber note listing `unreadFilings` when any.
- `election-cards.tsx`: `electionCard(...)`, `raceCard(...)`, `candidateCard(...)` returning `ImageResponse` at `CARD_SIZE`, using the Poppins loader pattern from `src/og/card.tsx` (export the loader from there rather than copying it). Names clamp to two lines with the long-title rule from `card.tsx`.

- [ ] **Step 1: Write failing tests** in `view.test.ts`: `pct(1, 300)` "<1%", `pct(0, 300)` "0%", `pct(186, 300)` "62%"; `shares` null when `matrix` is empty (Review Focus 1); `topCells` skips zero cells and returns the spec example labels; `parseSlice({from:"mars"})` → `{}`, `parseSlice({from:["alameda","county"]})` → `{}`, `parseSlice({from:"alameda", type:"individual"})` → both (Review Focus 2); `sliceQuery({type:"political", from:"other"})` → `"?from=other&type=political"`; `sliceLabel` for the four shapes above; `sliceBands` with `{from:"alameda"}` sums the Alameda row's three cells; `formatUsd(1362049)` "$13,620"; `keyDateStates` with today equal to a key date → that date is `next`, the day after → `past` (Review Focus 5); `displayName` for `measure-l/no` → "No on Measure L".
- [ ] **Step 2:** Run `corepack pnpm test src/elections/view.test.ts`; expect failures. Implement `view.ts`; expect pass.
- [ ] **Step 3:** Build the components and card helpers. Verify by running `corepack pnpm build` (expect success) and `corepack pnpm lint` (expect clean).
- [ ] **Step 4: Commit** `feat: add election display helpers, heatmap and money components`.

### Task 6: Election page, `/elections` redirect and /about methodology

**Files:**
- Create: `src/app/elections/[election]/page.tsx`, `src/app/elections/[election]/opengraph-image.tsx`, `test/e2e/elections.test.ts`
- Modify: `src/app/elections/page.tsx`, `src/app/elections/opengraph-image.tsx` (only if its title changes), `src/lib/metadata.ts` (`PAGES.elections` description: "Campaign money in City of Alameda elections, race by race."), `src/check/check-site.ts` (`ROUTES`: replace `/elections` with `/elections/2026-11-03-general`), `content/about.mdx`

**Interfaces:**
- Consumes: registry, `focus.ts`, `view.ts`, components, `electionCard`.
- Route: `generateStaticParams` from `ELECTIONS`; `dynamicParams = false`; `revalidate = 3600`.

- [ ] **Step 1: Write failing e2e tests** in `test/e2e/elections.test.ts` (fetch with `redirect: "manual"`):
  - `/elections` → if `electionInFocus(ELECTIONS, new Date())` returns an election, status 307 with `location` ending `/elections/<slug>`; otherwise 200 listing every election.
  - `/elections/2026-11-03-general` → 200, HTML contains each race name, "Outside groups", and "data through".
  - `/elections/1999-01-01-general` → 404 inside the site frame (Review Focus 3).
- [ ] **Step 2:** Run `corepack pnpm test:e2e`; expect failures.
- [ ] **Step 3: `/elections`**: `await connection()`, then `redirect()` to the election in focus (307), else a plain list newest first. **Election page**: title = election name; description "Who is paying for each City of Alameda race on the <date> ballot: raised, spent and where the money comes from." Sections in spec order: links out (Ballotpedia, Alameda County Registrar of Voters), Key dates, Races (one card per race with `CandidateMoney` per candidate or side; a race card links to its race page), Outside groups (one line per group: name, total, "for <name>" / "against <name>" per target; omit groups with no local targets), Source line. Preview card: election name, "data through <date>".
- [ ] **Step 4: /about** — under "Methodology & disclosures" replace "Details arrive with the elections explorer." and add short sections covering: how data is collected (by hand, at human pace, and why); itemized-only and what that leaves out; amendments, 497 and 496 rules; locality from ZIP (source of the County ZIP list) and donor type from entity code; paper-filing transcription and the reported-vs-schedule note; money split out (candidate's own, carried over, loans); the no-names rule; "filings we couldn't read". Keep the heading `Methodology & disclosures` so the `#methodology--disclosures` anchor holds.
- [ ] **Step 5:** Run `corepack pnpm test:e2e`; expect pass (including `check-site` against the new route). Take a 390px-wide and a 1280px-wide screenshot of the election page and check by eye: no overflow, long names wrap.
- [ ] **Step 6: Commit** `feat: add the election page and send /elections to the election in focus`.

### Task 7: Race page

**Files:**
- Create: `src/app/elections/[election]/[race]/page.tsx`, `src/app/elections/[election]/[race]/opengraph-image.tsx`
- Modify: `src/check/check-site.ts` (`ROUTES` add `/elections/2026-11-03-general/mayor`, `/elections/2026-11-03-general/measure-l`), `test/e2e/elections.test.ts`

**Interfaces:**
- Consumes: Task 5 components and `raceCard`. `generateStaticParams` over all races; `dynamicParams = false`.

- [ ] **Step 1: Write failing e2e tests:** `/elections/2026-11-03-general/mayor` contains all three candidate names and "from paper filing" (Daysog); `/elections/2026-11-03-general/measure-n` contains "No campaign finance filings on record with the City for either side."; `/elections/2026-11-03-general/no-such-race` → 404.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Title = race name (e.g. "Mayor · November 3, 2026"); description "<names> — raised and spent, itemized, through <date>." Candidates sorted by raised (no-filings and short-form last), each `CandidateMoney` with a larger heatmap side by side on desktop (small multiples), each linking to its candidate page; reported-differences note under a paper filer; links out to Ballotpedia and acvote where present; the source line. Preview card: race name, one bar per candidate's raised, "data through <date>".
- [ ] **Step 4:** Run `corepack pnpm test:e2e`; expect pass. Screenshots at 390px and 1280px.
- [ ] **Step 5: Commit** `feat: add race pages with side-by-side heatmaps`.

### Task 8: Candidate page and heatmap filters

**Files:**
- Create: `src/app/elections/[election]/[race]/[candidate]/page.tsx`, `src/app/elections/[election]/[race]/[candidate]/card.png/route.tsx`
- Modify: `src/check/check-site.ts` (`ROUTES` add `/elections/2026-11-03-general/mayor/tony-daysog` and `/elections/2026-11-03-general/city-council/marcie-johnson?from=alameda&type=individual`), `test/e2e/elections.test.ts`

**Interfaces:**
- Consumes: `parseSlice`, `sliceQuery`, `sliceLabel`, `sliceBands`, `Heatmap` with `hrefFor`/`selected`, `candidateCard`.
- The `[candidate]` segment also takes `yes` and `no` under measure races. Unknown slugs → `notFound()`.
- Metadata from `generateMetadata({ params, searchParams })`: canonical = path + `sliceQuery(parseSlice(searchParams))`; `openGraph.images` and `twitter.images` = `<path>/card.png<same query>` at 1200×630 (this page sets images explicitly because the file convention can't see the query).

- [ ] **Step 1: Write failing e2e tests:**
  - `/…/mayor/tony-daysog` → 200, title starts "Who gave to Tony Daysog", contains "loaned by the candidate" and "from paper filing".
  - `/…/school-board/gary-lym` → contains "No campaign finance filings on record with the City."
  - `/…/city-council/steve-slauson` → contains "Filed a short form".
  - `/…/city-council/marcie-johnson?from=alameda&type=individual` → `<title>` and description contain "individuals from Alameda"; canonical ends with that query; the page shows the teal chip with a clear link to the plain path.
  - `?from=mars&type=individual&type=political` → canonical has no query and the title has no slice (Review Focus 2).
  - `/…/measure-l/yes` → 200, title "Who gave to Yes on Measure L".
  - The `card.png` route with and without a slice query → 200 `image/png`, 1200×630 (use `pngSize`).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Title "Who gave to <name>" + `: <slice label>` when a slice is active. Description "<name> (<race>) raised $X and spent $Y in itemized contributions through <date>." plus " <Slice label, capitalized>: $Z of it." when a slice is active. Layout: headline numbers and split-out lines; the heatmap whose cells and row/column headers link to their slice (tapping the active one links to the plain path); the active filter as a teal chip with ×; amount bands as horizontal bars from `sliceBands`, in `BANDS` order with the spec's labels; reported differences for paper filers; outside spending for and against, one line per group; the source line. Preview card: name, raised vs. spent, heatmap, slice in words.
- [ ] **Step 4:** Run `corepack pnpm test:e2e`; expect pass. Screenshots at 390px and 1280px of a plain and a sliced page.
- [ ] **Step 5: Commit** `feat: add candidate pages with heatmap slice filters`.

---

## After the tasks

- Final whole-branch review; then `superpowers:finishing-a-development-branch`. Pushing, the PR, the preview deploy and the production deploy wait for the maintainer.
- Issues to file for out-of-scope items the spec lists (roadmap 1–6), if not already filed, plus: a County candidate-list check once acvote's list page returns, and any 496s left in `unmatched`.

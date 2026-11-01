# Contributions pipeline and elections views

The second spec for openalameda.org. The first, `docs/specs/site-foundation.md`, built the frame, the static pages and share previews. This one adds campaign-finance data for the November 3, 2026 general election and replaces the `/elections` placeholder. It ships on October 31, 2026, three days before the election.

## Why

Alameda residents get mailers, door hangers and endorsements, but the City's disclosure portal is hard to use: you search one filer at a time and open one PDF at a time. The question residents ask — "who is paying for this race, and how much of it is from here?" — has no answer anywhere in one view. This spec answers it for each local race, in a form that can be pasted into a group chat or a Nextdoor thread and unfurl well.

Success: a resident opens one link, sees each Alameda race with each candidate's money side by side, and can share a link to any race or candidate that previews with the numbers.

Anti-goals (a failure even if it works):

- Numbers that look complete but aren't. Every view says what it counts and what it can't.
- Hammering the City's site. The data is collected by hand, at human pace (see [Data collection](#data-collection)).
- Publishing more about individual donors than the purpose needs (see [Privacy](#privacy)).

## Scope

In scope for today:

1. A hand-kept elections file and the "election in focus" rule, with `/elections` redirecting to the election in focus.
2. The election page for `2026-11-03-general`: key dates, one card per local race, outside groups, external links.
3. A race page and a candidate (or measure-side) page, each shareable with its own preview card.
4. A local ingest script that turns the downloaded filings into committed JSON.
5. Methodology additions to `/about`.

**Deadline and cut order** (Claude's call): live on production today, October 31. Each step below can ship on its own, so if time runs short, ship in this order and stop where the day ends:

1. ingest, then the election page with its race cards;
2. race pages;
3. candidate pages;
4. heatmap-cell filters on candidate pages.

The redirect and the preview cards go out with the page they belong to.

Out of scope (each becomes a GitHub issue; roadmap order from the brainstorm):

1. Backfill earlier elections from the same source (back to filings of 2018-07-31); adds the multi-election "zoom out" view and an election selector.
2. Election results for the 2026 primary; the election page grows a results section, with a "pending" panel for the general.
3. Election night (hard deadline: polls close Tuesday 11/3/2026, 8 pm): automated vote-count fetches and a "voting is open" variant of the election page — Alameda precinct map, candidates and measures, how Alameda is voting, countywide (maybe statewide) standing.
4. Daily automated pipeline — blocked on the City Clerk (see [Data collection](#data-collection)).
5. "How typical is this" context (comparisons to past races).
6. Filters beyond the heatmap cells: amount bands, date ranges, loans and in-kind toggles.

## Elections data and the election in focus

A hand-kept file, `data/elections.json`, lists elections:

| Field | Example |
| --- | --- |
| `slug` | `2026-11-03-general` (date + `-primary`, `-general` or `-special`) |
| `name` | `November 3, 2026 General Election` |
| `papersAvailable` | date candidates can first pull nomination papers |
| `electionDay` | `2026-11-03` |
| `resultsFinal` | date the County certifies; empty until known |
| `keyDates` | list of `{date, label}` — filing deadlines, 460 due dates, 24-hour reporting window start, voter registration deadline, election day, certification |
| `links` | `{ballotpedia, acvote}` URLs for the election. Ballotpedia has no City of Alameda election page for 2026; use the county page, https://ballotpedia.org/Municipal_elections_in_Alameda_County,_California_(2026) |

**In focus:** an election is in focus from 7 days before `papersAvailable` until 30 days after `resultsFinal` (indefinitely, while `resultsFinal` is empty and election day has passed). Evaluate at request time in `America/Los_Angeles`. If one is in focus, `/elections` redirects (307) to `/elections/<slug>`. If none is, `/elections` shows a plain list of elections, newest first, each linking to its page — the full multi-election view is roadmap item 1. If two overlap, the earlier election day wins.

Each election has a races file, `data/elections/<slug>/races.json`, also hand-kept:

- races in display order: Mayor, City Council, School Board (AUSD), then measures;
- per race: `slug`, `name`, seats, links (`ballotpedia`, `acvote` where a race-level page exists). Ballotpedia has pages for the three measures but none for Mayor, City Council or School Board (checked 10/31);
- per candidate:
  - `slug`;
  - ballot name;
  - `legalName` (last, first), used to find the candidate's own money;
  - ballot designation, if handy;
  - the committee filer IDs (from the CAL `Filer_ID`) and filer names for this campaign, or an empty list if there are none;
  - `priorCommittees`: the candidate's own earlier committees, used to find carried-over money;
- per measure: `slug`, title, and two sides, `yes` and `no`, each with its committees.

**Races come from the ballot, not from who files.** A candidate with no filings still gets a card reading "No campaign finance filings on record with the City." (Example: Gary Lym, School Board: no match by filer or candidate name, checked 10/31.) A candidate whose only filing is a short-form 470 gets a card reading "Filed a short form: expects to raise and spend under $2,000. No committee." with the filing date. (Example: Steve Slauson, 470-C filed 09/14/2026.) Committees from earlier elections (e.g. "Daysog for Council 2022") are not part of a 2026 campaign. PACs and other committees not tied to a candidate are **outside groups**.

Known for 2026-11-03 (verify against the County's candidate list before shipping; the County list wins): Mayor — Tracy Jensen, Malia Vella, Tony Daysog. City Council — Marcie Johnson, Thushan Amarasiriwardena, Tyler Savage, Amos White, Maria Bondonno, Donald Scott Means, Steve Slauson. School Board — Carrie Hahnel, Joyce Boyd, Ryan LaLonde, Gary Lym. Measure L (Safer Alameda GO bond) — yes: "Safer Alameda-Yes on Bond Measure L 2026"; no: "Alameda Climate Change Belivers Opposing Measure L 2026" (sic). Measure M (amend and repeal outdated City Charter provisions) and Measure N (City property sales and leases charter amendment) have no committees on either side and no outside spending in the filings (checked 10/31); their cards read "No campaign finance filings on record with the City for either side." (Claude's call.)

Note (2026-11-01): the City's final roster (8/12/2026) lists six council candidates, and Donald Scott Means is not among them; he is removed from `races.json`, and his committee's 460-T is logged as not used for this election.

Note (2026-11-01), race model: an office race may carry `onBallot: false`; absent means on the ballot. The election page card, the race page and each candidate page show the one standard sentence (`offBallotNote` in `src/elections/view.ts`, its only copy), the race page drops its election-day line, its title and share-card title read "<race> · not on the ballot" rather than pairing the seat with the election date (`raceTitle`), and the election description names the date rather than a ballot.

Note (2026-11-01), unopposed seat: the candidate for a separate two-year Alameda Unified board seat ran unopposed, so that seat is not on the ballot. It is the race `school-board-two-year-term` (one seat, labeled "School Board, two-year term"), flagged off the ballot, and that candidate is not in the two-seat `school-board` race. His filed money shows as usual.

Ballotpedia measure pages:

- L: https://ballotpedia.org/Alameda,_California,_Measure_L,_Emergency_Preparedness_and_Infrastructure_Bond_Measure_(November_2026)
- M: https://ballotpedia.org/Alameda,_California,_Measure_M,_Amend_and_Repeal_Outdated_City_Charter_Provisions_(November_2026)
- N: https://ballotpedia.org/Alameda,_California,_Measure_N,_City_Property_Sales_and_Leases_Charter_Amendment_(November_2026)

Not on this ballot, though they file with the City: Kevin Kearney (City Auditor) and Kevin Kennedy (City Treasurer), who each filed a 470. They are left out of races.json, and ingest skips their filings.

External links are entered by hand and each checked with a single fetch; a link that 404s is left out rather than guessed.

## Data collection

The source is the City's Granicus CampaignDocs portal. Its `robots.txt` disallows crawling, there is no API, and the City publishes no bulk file. The user chose to collect manually, in their own browser, at human pace: one action at a time, pauses of seconds between clicks, no crawling beyond the current election. That respects the spirit of the rule — no indexing, no surge in load.

Two exports exist; the pipeline uses the second.

- **Advanced Search → "Export Search Results To Excel"**, with Show Transactions on: every 2026 filing in one file, but only 9 columns, and amended reports have a blank transaction type. Used only as an index and cross-check.
- **Per-form "Export" (Excel icon)**: the standard California CAL e-filing layout, 88 columns, including `Filer_ID`, `Rpt_Date`, `From_Date`, `Thru_Date`, `Rec_Type` (`RCPT`/`EXPN`/…), `Form_Type` (the schedule: `A` monetary, `C` nonmonetary, `B1` loans, `E` payments, `D` supporting/opposing, `F496P3`, `497P1`, …), `Tran_ID`, `Entity_Cd`, entity names, `Entity_City`/`ST`/`ZIP4`, `Entity_Emp`/`Occ`, `Tran_Date`, `Amount`, `Cum_YTD`, `Expn_Code`, `Cand_Nam*`, `Bal_Name`, `Sup_Opp_Cd`, `Memo_Code`. Street addresses are blank (redacted at source). Files are legacy `.xls` (BIFF).
- **Paper filers** exist only as scanned PDFs with no text layer: Daysog for Mayor 2026 (three 460s, 16–17 pages each), Daysog for Council 2018 and 2022 (one 460 each, 1/1–6/30/2026), Measure L No (two 460s, 3 pages each) and one Firefighters IAFF 496 ($9,500 of digital ads supporting Measure L, 10/19/2026; already transcribed). They are transcribed by hand into a TSV with the same CAL column names plus `Source = pdf`, and each transcription is checked against the form's own summary-page totals. Slauson's 470-C carries no transactions and is recorded only as a status (see above).

**Who does what.**

- We collect the October 31 snapshot.
- Claude transcribes the paper filings and fills in the hand-kept files: elections, races, key dates and links.
- The user reviews all of it.

A refresh before election day (new 497s and 496s) re-runs the same loop:

1. collect the new filings;
2. run `pnpm ingest`;
3. commit `finance.json`;
4. deploy.

Whether and when to refresh is the user's call.

Raw files live in `data/raw/<election-slug>/` and are **not committed** (gitignored): they hold individual donors' names, employers and occupations. A `data/raw/<election-slug>/manifest.tsv` (also uncommitted) maps each file to its filer, form, amendment, filing date and period. The committed output is described under [Ingest](#ingest).

## Ingest

`pnpm ingest <election-slug>` reads `data/raw/<slug>/`, `data/elections/<slug>/races.json` and the ZIP list, and writes `data/elections/<slug>/finance.json`. It runs locally; the site reads only committed JSON at build time. Re-running on the same inputs produces byte-identical output.

Rules, in order:

1. **Latest amendment wins.** For period reports (460, 450, 460-T and their `-A` amendments) keep only the latest-filed version per (filer, form family, period). A 460-A replaces the whole report, not just the changed rows.
2. **Late reports fill the gap.** A 497 contribution counts only if its date is after the `Thru_Date` of that committee's latest period report; earlier 497s are already on a 460. Same rule for 496 independent expenditures against the spender's Schedule D. 2026-10-31: for `F496` rows the cutoff uses only the spender's 460-family period reports, and a spender with no 460-family period report has its 496s counted regardless of date (its 450 reports independent expenditures as F450P5, which isn't counted).
3. **Memo rows don't count** (`Memo_Code` set): they itemize a parent row already counted.
4. **Whole campaign.** Sum every report of the committee for this campaign, 2025 and 2026.
5. **Raised** = monetary contributions (Schedule A) + nonmonetary (C) + contributions on counted 497s. Loans (B1, and loans reported on a 497) are reported separately, not in raised. **Spent** = payments (E), excluding memo rows; accrued unpaid bills (F) are not spent.
6. **Itemized only.** Contributions under $100 are reported only as a lump sum on the summary page, which the CAL export lacks. Every figure is "itemized"; paper filers' summary totals may be shown as reported totals where we have them, labeled.
7. **Locality** from the 5-digit ZIP: `94501`, `94502` → City of Alameda; any other Alameda County ZIP → Alameda County; everything else → Other. Missing or malformed ZIP → Other, and counted in a `unknownLocality` total. The County ZIP list is a committed static file with its source noted. (2026-10-31: wherever a page names Other money as outside Alameda County and the summary has unknown-locality money, the page says how much of it has no usable ZIP code.)
    - Note (2026-11-01), transcription corrections: when we read a paper filing differently from what the filer wrote (for example a four-digit ZIP read as the Alameda ZIP it most likely means), the decision is a row in `data/elections/<slug>/corrections.json`: `filing` (the manifest path), `tranId`, `field` (the CAL column), `asFiled` (empty when the filer left the field blank), `correctedTo`, `reason`, `decidedBy` (`agent` or `human`), `decidedAt` (an ISO 8601 UTC timestamp with seconds, shown on the page in Pacific time).
    - The ingest applies each correction as an overlay on the rows it reads, before any counting rule, and never writes the raw files. It fails, rather than apply silently, when the filing or `tranId` is not found, the field is not a column of that filing, or the row no longer reads `asFiled` (a blank `asFiled` requires the field to be exactly empty). It also fails when the corrected row changes no published figure: the filing is superseded by an amendment, the late-report row was dropped by the late-window dedupe or falls on or before the filer's latest period report, the filing is not used for this election, the row is in no total (a memo row, for example), or a locality override sits on a row whose locality no total reads (an expenditure, a loan, or the candidate's own or carried-over money). It fails, too, for a filing that belongs to no candidate or measure side, because corrections on outside-group filings are not shown on any page yet. A `reason` is written by a person, reviewed in the pull request, and must never name a contributor. Only an allowlist of fields that never identify a person may be corrected: `Entity_ZIP4`, `Entity_City`, `Entity_ST`, `Entity_Cd`, `Tran_Date`, `Amount` and `Memo_Code`; anything else is refused, so the log and `finance.json` never carry a name or street address. `decidedAt` must be a real calendar moment. One more field, `locality`, is not a column: it overrides the category the ingest derived from the row's ZIP (`asFiled` is that derived reading, or `unknown` for a row with no usable ZIP; `correctedTo` is `alameda`, `county` or `other`). The ZIP itself stays as filed; a row whose locality a person has placed no longer counts toward the unknown-ZIP disclosure, and the override must pass the same counted-row check.
    - `finance.json` carries a top-level `corrections` array (the fields above plus the race and candidate slugs), never a contributor name or any other column of the row. The candidate page lists each one under "How we read the filings" (a measure side's corrections, recorded under its race and `yes` or `no`, also appear on the measure's race page), and `/about` says the log exists.
8. **Donor type** from `Entity_Cd`: `IND` → Individual; `OTH` → Organization (businesses, unions, nonprofits); `COM`, `PTY`, `SCC` → Political. Anything else → Organization, logged.
9. **Outside spending**: from outside groups' Schedule D and counted 496 rows, attribute each item to a candidate (by `Cand_Nam*` matched to races.json) or measure (`Bal_Name`/`Bal_Num`), side from `Sup_Opp_Cd`. Unmatched items are listed in the ingest log and in `finance.json` under `unmatched`, not dropped silently. Direct contributions from a PAC to a candidate are already in the candidate's raised (Political column) and are not outside spending.
10. **Filer name normalization**: match committees by `Filer_ID`; names only for display.
11. **Two kinds of money are split out (the user's decision).** Each is included in **raised**, shown as its own line on the card, and left out of the heatmap, both percentages and the amount bands:
    - **Carried over:** transfers from the candidate's own earlier committees. These are listed per candidate in races.json as `priorCommittees`, by filer ID and name. A contribution counts as carried over when its contributor's committee ID or exact name matches one of them.
    - **Candidate's own money:** contributions from the candidate, including loans the candidate forgave (Form 460 reports a forgiven loan as a Schedule A contribution, so it is counted once, there). These are identified by matching the contributor's name to the candidate's `legalName` in races.json (last + first, case-, accent- and punctuation-insensitive; 2026-10-31: only the first token of the first name is compared, so a middle name or initial on the filing still matches). Each match is listed in the ingest log for review.

    The denominator for both percentages and the heatmap is raised minus these two amounts: "itemized contributions from others."

`finance.json` holds, per candidate or measure side: raised, spent, loans, own money, carried over, contribution count, the 3×3 locality × type matrix (dollars and counts), and amount-band totals; per outside group: total spent per candidate/side; plus `dataThrough` (latest `Thru_Date` or late-report date across included filings), `collectedOn` (download date), and lists of included filings and **filings we couldn't read** (with links to the source). It contains no individual's name.

## Pages

All under `/elections/<election-slug>`. Every page server-renders its numbers, has its own title, description, canonical URL and 1200×630 preview card through the foundation's `next/og` mechanism, and falls back to the default card on failure. Phones first; one wider desktop layout.

### Election page — `/elections/2026-11-03-general`

1. Title, election day, and links out: Ballotpedia, Alameda County Registrar of Voters.
2. **Key dates**: a short list from `keyDates`, past dates muted, the next one highlighted.
3. **Races**: one card per race (Mayor, City Council, School Board, Measures L, M and N) — see Race card.
4. **Outside groups**: who spent, how much, for or against whom; one line per group.
5. Source line: "City of Alameda campaign disclosures, itemized contributions, data through <date>, collected <date>. How we count." The amber note lists filings we couldn't read, if any.

### Race card and race page — `/elections/2026-11-03-general/<race-slug>`

The card on the election page and the top of the race page show, per candidate (or Yes and No):

- **Headline: raised vs. spent**, whole campaign, itemized: two numbers side by side, with a thin bar showing spent as a share of raised.
- **Split-out lines**, each omitted when it's zero: "$X from the candidate", "$X loaned by the candidate" (outstanding loans from the candidate, Schedule B1; not part of raised, per rule 5) and "$X carried over from an earlier campaign". The loan line is Claude's call: without it, a card can show spending far above raised with no explanation. (Example: Daysog for Mayor reports a $26,805 loan from the candidate, 9/25/2026, against $13,620 raised, of which $6,395 is his own contributions.) 2026-10-31: a fourth line, "$X in loans from others" (outstanding loans from anyone but the candidate), joins these for the same reason; it never names the lender.
- **Reported figures differ from the schedules:** when a paper filer's own summary totals disagree with the sum of its schedule lines, the card uses the schedule sums. The ingest log and the candidate page note the difference. (Example: Daysog's 10/22 report under-totals expenditures by $2,000 of in-kind services.)
- **Outside groups**: "$X supporting · $Y opposing", omitted when both are zero.
- **% from individuals** and **% from Alameda** (City of Alameda, any donor type), shares of itemized dollars raised.
- **Heatmap**: a 3×3 grid. Rows: City of Alameda, Alameda County, Other. Columns: Individual, Organization, Political. Top-left is local individuals; bottom-right is non-local political money. Each cell is shaded by its share of the candidate's itemized raised dollars, on one shared scale so grids compare across candidates. The card names the top three cells as percentages ("62% Alameda individuals · 14% county individuals · 9% non-local political").

On the race page the candidates' heatmaps sit side by side (small multiples), sorted by raised. Paper filers show their transcribed figures with a "from paper filing" label. Candidates with no filings show the no-filings line. The race page links out to the race on Ballotpedia and acvote where those exist.

Race-page preview card: race name, each candidate's raised as a bar, "data through <date>".

### Candidate page — `/elections/2026-11-03-general/<race-slug>/<candidate-slug>`

The layout B view from the brainstorm: title "Who gave to <candidate>", the headline numbers, the heatmap, and amount bands as bars. Each band totals individual contributions, not donors: $1,000+, $500–999, $250–499, $100–249 and "Under $100 (itemized)". The last band holds small gifts that were itemized only because the donor's total for the period passed $100 (Claude's call).

**Heatmap cells are filters.**

- Tapping a cell, a row header or a column header narrows the bands to that slice.
- Only one selection is active at a time. Tapping it again clears it.
- The selection lives in the URL, using `from` (`alameda`, `county` or `other`) and `type` (`individual`, `organization` or `political`). Either parameter can be left out, as in `?from=alameda&type=individual` or `?type=political`.
- Unknown values are ignored, and the page shows the full view.
- The view is shareable, and its preview names the slice.
- The active filter shows as a teal chip with an × to clear it.

Exclusion chips (red "−") and multi-select wait for the filters roadmap item (Claude's call). The URL format above is a public contract: later filters add parameters and never rename these. Outside spending for and against this candidate is listed below. Measure sides use the same page (`/measure-l/yes`).

Candidate preview card: candidate name, raised vs. spent, the heatmap, and any active slice in words.

## Privacy

Contributor names, employers and occupations are public record, but this site shows **aggregates only** for individuals: no individual's name appears on any page or in any committed file. Organizations and political committees may be named (outside groups always are). Revisit when building a donor search.

## /about additions

Methodology & Disclosures gains: how data is collected (by hand, at human pace, and why); itemized-only and what that leaves out; amendment, 497 and 496 rules; how locality and donor type are assigned; paper-filing transcription; the no-names rule; and the "filings we couldn't read" note.

## Testing

- Unit: each ingest rule above, on small fixture CSVs — amendment replacement, 497 cutoff, memo rows, locality edge cases (ZIP+4, missing ZIP, county ZIP), entity codes, outside-spending attribution and the `unmatched` list. Determinism: two runs, identical bytes.
- Unit: the in-focus rule at its boundaries (papers − 7 days, final + 30 days, empty `resultsFinal`, overlap) and the `/elections` redirect.
- Render: election, race and candidate pages render with the full meta-tag set; a candidate with no filings and a paper filer render; a slice URL renders its slice and names it in the title and description.
- Preview: each new card route returns a 1200×630 PNG; `check-site` passes against the preview deployment.
- A totals cross-check: per committee, ingest's raised vs. the sum of matching rows in the Advanced Search index export, reported (not asserted) in the ingest log.

## Left to the builder

How to read `.xls` (avoid the unmaintained `xlsx@0.18.5` on npm; a converter step is fine), component structure, chart rendering (plain SVG is enough; satori renders SVG in cards), the heatmap colour ramp within the teal palette, exact copy beyond what's quoted here, and how the County ZIP list is sourced.

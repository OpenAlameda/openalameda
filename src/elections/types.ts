export type KeyDate = { date: string; label: string };
export type Links = { ballotpedia?: string; acvote?: string };
export type Election = {
  slug: string;
  name: string;
  papersAvailable: string;
  electionDay: string;
  resultsFinal: string | null;
  keyDates: KeyDate[];
  links: Links;
};
export type Committee = { id: string | null; name: string; aliases?: string[] };
export type Candidate = {
  slug: string;
  ballotName: string;
  legalName: string;
  designation?: string;
  committees: Committee[];
  priorCommittees: Committee[];
  shortForm?: { form: string; filed: string };
};
export type MeasureSide = { committees: Committee[] };
export type OfficeRace = {
  kind: "office";
  slug: string;
  name: string;
  seats: number;
  /** False for a seat that is not on the ballot (an unopposed race); absent means on the ballot. */
  onBallot?: boolean;
  links: Links;
  candidates: Candidate[];
};
export type MeasureRace = {
  kind: "measure";
  slug: string;
  name: string;
  title: string;
  links: Links;
  sides: { yes: MeasureSide; no: MeasureSide };
};
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

export type ReportedDiff = {
  filed: string;
  line: number;
  label: string;
  reportedCents: number;
  scheduleCents: number;
};
export type MoneySummary = {
  status: "filed" | "no-filings" | "short-form";
  paper: boolean;
  raisedCents: number;
  spentCents: number;
  ownCents: number;
  carriedCents: number;
  loansFromCandidateCents: number;
  otherLoansCents: number;
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
export type Unmatched = {
  filerKey: string;
  filer: string;
  tranId: string;
  formType: string;
  date: string | null;
  cents: number;
  description: string;
};
export type Filing = {
  filerKey: string;
  filer: string;
  form: string;
  amendment: number;
  filed: string;
  period: { from: string; thru: string } | null;
  source: "efile" | "paper";
  file: string;
};
export type UnreadFiling = { filer: string; form: string; filed: string; period: string; note: string };
/** A hand-kept decision to read a filing's field differently from how the filer wrote it. */
export type Correction = {
  /** The manifest path of the source filing, as in `Filing.file`. */
  filing: string;
  tranId: string;
  /** The CAL column name. */
  field: string;
  asFiled: string;
  correctedTo: string;
  reason: string;
  /** Whether an AI agent or a person made the reading decision. */
  decidedBy: "agent" | "human";
  /** ISO 8601 UTC timestamp with seconds, e.g. 2026-11-01T13:15:55Z. */
  decidedAt: string;
};
/** A correction as finance.json carries it: the log entry plus the race and candidate it touched. */
/** `candidate` is the candidate's slug, or "yes" / "no" for a measure side; null when no race committee owns the filing. */
export type AppliedCorrection = Correction & { race: string | null; candidate: string | null };
export type FinanceFile = {
  election: string;
  dataThrough: string;
  collectedOn: string;
  // Key is "<race>/<candidate>" or "<race>/yes" | "<race>/no".
  summaries: Record<string, MoneySummary>;
  outsideGroups: OutsideGroup[];
  unmatched: Unmatched[];
  filings: Filing[];
  unreadFilings: UnreadFiling[];
  corrections: AppliedCorrection[];
};

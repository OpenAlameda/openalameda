import {
  BANDS,
  DONOR_TYPES,
  LOCALITIES,
  type BandCents,
  type DonorType,
  type KeyDate,
  type Locality,
  type MoneySummary,
  type Race,
} from "./types";

/** A heatmap selection: a cell, a whole row (`from`) or a whole column (`type`). */
export type Slice = { from?: Locality; type?: DonorType };

/** Dollars from others: the matrix total, which leaves out the candidate's own and carried-over money. */
export function othersCents(s: MoneySummary): number {
  let total = 0;
  for (const from of LOCALITIES) for (const type of DONOR_TYPES) total += s.matrix[from][type].cents;
  return total;
}

/** Whole-number percent; a nonzero share that rounds to zero reads "<1%". */
export function pct(part: number, whole: number): string {
  if (part <= 0 || whole <= 0) return "0%";
  const n = Math.round((part / whole) * 100);
  return n === 0 ? "<1%" : `${n}%`;
}

/** Share of itemized dollars from individuals and from the City of Alameda; null with no dollars from others. */
export function shares(s: MoneySummary): { individuals: string; alameda: string } | null {
  const whole = othersCents(s);
  if (whole <= 0) return null;
  let individuals = 0;
  let alameda = 0;
  for (const from of LOCALITIES) {
    individuals += s.matrix[from].individual.cents;
  }
  for (const type of DONOR_TYPES) alameda += s.matrix.alameda[type].cents;
  return { individuals: pct(individuals, whole), alameda: pct(alameda, whole) };
}

/**
 * Money with a missing or malformed ZIP is counted in the "other" locality (spec rule 7), so wherever
 * that locality is named in words and the summary has such money, the wording says so. These are the
 * only places that wording lives.
 */
const LOCALITY_WORD: Record<Locality, string> = { alameda: "Alameda", county: "county", other: "non-local" };
const LOCALITY_WORD_UNKNOWN_ZIP = "non-local or no-ZIP";
const OTHER_FROM_PHRASE = "from outside Alameda County";
const OTHER_FROM_PHRASE_UNKNOWN_ZIP = "from outside Alameda County or with no usable ZIP";

/** True when some of the summary's money has no usable ZIP and so sits in the "other" locality. */
export function hasUnknownZip(s: MoneySummary | undefined): boolean {
  return (s?.unknownLocalityCents ?? 0) > 0;
}

/** The candidate-page note disclosing unknown-ZIP money; null when there is none. */
export function unknownZipNote(s: MoneySummary): string | null {
  return hasUnknownZip(s)
    ? `${formatUsd(s.unknownLocalityCents)} of this has no usable ZIP code and is counted as outside Alameda County.`
    : null;
}
const TYPE_WORD: Record<DonorType, string> = {
  individual: "individuals",
  organization: "organizations",
  political: "political",
};

/** A cell in words: "Alameda individuals", "county organizations", "non-local political". */
export function cellLabel(from: Locality, type: DonorType, unknownZip = false): string {
  const word = from === "other" && unknownZip ? LOCALITY_WORD_UNKNOWN_ZIP : LOCALITY_WORD[from];
  return `${word} ${TYPE_WORD[type]}`;
}

/** The largest nonzero cells by dollars, as shares of dollars from others. */
export function topCells(
  s: MoneySummary,
  n = 3,
): { from: Locality; type: DonorType; label: string; pct: string }[] {
  const whole = othersCents(s);
  const cells = LOCALITIES.flatMap((from) =>
    DONOR_TYPES.map((type) => ({ from, type, cents: s.matrix[from][type].cents })),
  ).filter((c) => c.cents > 0);
  // Array.prototype.sort is stable, so ties keep row-major order.
  cells.sort((a, b) => b.cents - a.cents);
  return cells.slice(0, n).map(({ from, type, cents }) => ({
    from,
    type,
    label: cellLabel(from, type, hasUnknownZip(s)),
    pct: pct(cents, whole),
  }));
}

function one<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Reads `?from=` and `?type=`; arrays (repeated parameters) and unknown values leave the field out. */
export function parseSlice(q: Record<string, string | string[] | undefined>): Slice {
  const from = one(q.from, LOCALITIES);
  const type = one(q.type, DONOR_TYPES);
  return { ...(from && { from }), ...(type && { type }) };
}

/** The slice as a query string, `from` first; "" when empty. */
export function sliceQuery(s: Slice): string {
  const params = new URLSearchParams();
  if (s.from) params.set("from", s.from);
  if (s.type) params.set("type", s.type);
  const q = params.toString();
  return q ? `?${q}` : "";
}

const FROM_PHRASE: Record<Locality, string> = {
  alameda: "from Alameda",
  county: "from elsewhere in Alameda County",
  other: OTHER_FROM_PHRASE,
};
const TYPE_PHRASE: Record<DonorType, string> = {
  individual: "individuals",
  organization: "organizations",
  political: "political committees",
};

/** The slice in words for titles and chips; null when there is none. */
export function sliceLabel(s: Slice, unknownZip = false): string | null {
  const from =
    s.from === "other" && unknownZip ? OTHER_FROM_PHRASE_UNKNOWN_ZIP : s.from && FROM_PHRASE[s.from];
  if (s.from && s.type) return `${TYPE_PHRASE[s.type]} ${from}`;
  if (s.type) return TYPE_PHRASE[s.type];
  if (s.from) return `donors ${from}`;
  return null;
}

/** Amount-band dollars for the selected cells (the summary's own bands when the slice is empty). */
export function sliceBands(s: MoneySummary, slice: Slice): BandCents {
  if (!slice.from && !slice.type) return { ...s.bands };
  const out = Object.fromEntries(BANDS.map((b) => [b, 0])) as BandCents;
  for (const from of LOCALITIES) {
    if (slice.from && slice.from !== from) continue;
    for (const type of DONOR_TYPES) {
      if (slice.type && slice.type !== type) continue;
      for (const b of BANDS) out[b] += s.bandsByCell[from][type][b];
    }
  }
  return out;
}

/** Dollars from others inside the slice, summed over the selected heatmap cells. */
export function sliceCents(s: MoneySummary, slice: Slice): number {
  let total = 0;
  for (const from of LOCALITIES) {
    if (slice.from && slice.from !== from) continue;
    for (const type of DONOR_TYPES) {
      if (slice.type && slice.type !== type) continue;
      total += s.matrix[from][type].cents;
    }
  }
  return total;
}

/** Whole dollars, rounded half up: 1362049 -> "$13,620", 99999 -> "$1,000". */
export function formatUsd(cents: number): string {
  return `$${Math.floor((cents + 50) / 100).toLocaleString("en-US")}`;
}

/** "2026-10-17" -> "October 17, 2026", without a timezone shift. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Dates before `today` are past; the earliest on or after it is next; the rest are future. `today` is
 * YYYY-MM-DD. States line up with the input order, which need not be sorted.
 */
export function keyDateStates(dates: KeyDate[], today: string): ("past" | "next" | "future")[] {
  const upcoming = dates.map((d) => d.date).filter((d) => d >= today);
  const next = upcoming.length ? upcoming.reduce((a, b) => (b < a ? b : a)) : undefined;
  return dates.map((d) => (d.date < today ? "past" : d.date === next ? "next" : "future"));
}

/** Heatmap fill opacity for a cell's share of dollars from others; empty cells get none. */
export function heatOpacity(share: number): number {
  return share <= 0 ? 0 : 0.08 + 0.92 * share;
}

/** A candidate's ballot name, or "Yes on Measure L" / "No on Measure L". */
export function displayName(race: Race, key: string): string {
  if (race.kind === "measure") return `${key === "yes" ? "Yes" : "No"} on ${race.name}`;
  return race.candidates.find((c) => c.slug === key)?.ballotName ?? key;
}

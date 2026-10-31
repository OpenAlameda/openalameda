import { useId } from "react";
import Link from "next/link";
import { DONOR_TYPES, LOCALITIES, type DonorType, type Locality, type MoneySummary } from "@/elections/types";
import {
  cellLabel,
  hasUnknownZip,
  heatOpacity,
  othersCents,
  pct,
  sliceLabel,
  type Slice,
} from "@/elections/view";

const ROW_NAMES: Record<Locality, string> = {
  alameda: "City of Alameda",
  county: "Alameda County",
  other: "Other",
};
const COL_NAMES: Record<DonorType, string> = {
  individual: "Individual",
  organization: "Organization",
  political: "Political",
};
const ROW_SHORT: Record<Locality, string> = { alameda: "Alameda", county: "County", other: "Other" };
const COL_SHORT: Record<DonorType, string> = {
  individual: "Indiv.",
  organization: "Org.",
  political: "Political",
};

const TEAL = "#0B6E6E";
const NAVY = "#05204E";
const PAPER = "#FAF7F2";

type HeatmapProps = {
  summary: MoneySummary;
  /** Makes cells and row/column headers links. Receives the slice to show; `{}` clears the selection. */
  hrefFor?: (slice: Slice) => string;
  /** The active slice, outlined. */
  selected?: Slice;
  /** Smaller cells and no percentages, for race cards. */
  compact?: boolean;
  /** Names the grid for screen readers, e.g. the candidate's display name. */
  label?: string;
};

function same(a: Slice, b: Slice): boolean {
  return a.from === b.from && a.type === b.type;
}

/**
 * The 3×3 locality × donor type grid, each cell shaded by its share of itemized dollars from others on
 * one absolute scale, so grids compare across candidates. Tapping the active slice clears it.
 */
export function Heatmap({ summary, hrefFor, selected = {}, compact = false, label }: HeatmapProps) {
  const titleId = useId();
  const whole = othersCents(summary);
  const unknownZip = hasUnknownZip(summary);
  const cw = compact ? 40 : 72;
  const ch = compact ? 28 : 48;
  const gap = 3;
  const rowHead = compact ? 62 : 110;
  const colHead = compact ? 18 : 24;
  const width = rowHead + 3 * (cw + gap);
  const height = colHead + 3 * (ch + gap);
  const fontSize = compact ? 10 : 12;

  function link(slice: Slice, label: string, child: React.ReactNode) {
    if (!hrefFor) return child;
    const target = same(slice, selected) ? {} : slice;
    return (
      <Link
        href={hrefFor(target)}
        aria-label={label}
        aria-current={same(slice, selected) ? "true" : undefined}
      >
        {child}
      </Link>
    );
  }

  const summaryText =
    whole > 0
      ? "Share of itemized contributions from others, by where donors live and what kind of donor they are."
      : "No itemized contributions from others.";

  const fullText = label ? `${label}: ${summaryText}` : summaryText;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-labelledby={titleId}
        className="block w-full"
        style={{ maxWidth: width * (compact ? 1.4 : 1.8) }}
      >
        <title id={titleId}>{fullText}</title>
        {DONOR_TYPES.map((type, c) => {
          const x = rowHead + c * (cw + gap);
          const active = same({ type }, selected);
          return (
            <g key={type}>
              {link(
                { type },
                `Show only ${sliceLabel({ type }, unknownZip)}`,
                <text
                  x={x + cw / 2}
                  y={colHead - 6}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fontWeight={active ? 700 : 500}
                  fill={hrefFor ? TEAL : NAVY}
                  textDecoration={hrefFor ? "underline" : undefined}
                >
                  {COL_SHORT[type]}
                </text>,
              )}
            </g>
          );
        })}
        {LOCALITIES.map((from, r) => {
          const y = colHead + r * (ch + gap);
          const active = same({ from }, selected);
          return (
            <g key={from}>
              {link(
                { from },
                `Show only ${sliceLabel({ from }, unknownZip)}`,
                <text
                  x={rowHead - 8}
                  y={y + ch / 2 + fontSize / 3}
                  textAnchor="end"
                  fontSize={fontSize}
                  fontWeight={active ? 700 : 500}
                  fill={hrefFor ? TEAL : NAVY}
                  textDecoration={hrefFor ? "underline" : undefined}
                >
                  {compact ? ROW_SHORT[from] : ROW_NAMES[from]}
                </text>,
              )}
              {DONOR_TYPES.map((type, c) => {
                const cents = summary.matrix[from][type].cents;
                const share = whole > 0 ? cents / whole : 0;
                const opacity = heatOpacity(share);
                const x = rowHead + c * (cw + gap);
                const isSelected = same({ from, type }, selected);
                const cell = (
                  <g>
                    <rect
                      x={x}
                      y={y}
                      width={cw}
                      height={ch}
                      rx={3}
                      fill={PAPER}
                      stroke={NAVY}
                      strokeOpacity={0.2}
                    />
                    {opacity > 0 && (
                      <rect x={x} y={y} width={cw} height={ch} rx={3} fill={TEAL} fillOpacity={opacity} />
                    )}
                    {isSelected && (
                      <rect
                        x={x - 1}
                        y={y - 1}
                        width={cw + 2}
                        height={ch + 2}
                        rx={4}
                        fill="none"
                        stroke={NAVY}
                        strokeWidth={2.5}
                      />
                    )}
                    {!compact && cents > 0 && (
                      <text
                        x={x + cw / 2}
                        y={y + ch / 2 + 4}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={600}
                        fill={opacity > 0.7 ? "white" : NAVY}
                      >
                        {pct(cents, whole)}
                      </text>
                    )}
                  </g>
                );
                return (
                  <g key={type}>
                    {link({ from, type }, `Show only ${cellLabel(from, type, unknownZip)}`, cell)}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{fullText}</caption>
        <thead>
          <tr>
            <th scope="col">Where from</th>
            {DONOR_TYPES.map((t) => (
              <th key={t} scope="col">
                {COL_NAMES[t]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LOCALITIES.map((from) => (
            <tr key={from}>
              <th scope="row">{ROW_NAMES[from]}</th>
              {DONOR_TYPES.map((type) => (
                <td key={type}>{pct(summary.matrix[from][type].cents, whole)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

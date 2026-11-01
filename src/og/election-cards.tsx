import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import { DONOR_TYPES, LOCALITIES, type MoneySummary } from "@/elections/types";
import { formatDate, formatUsd, heatOpacity, othersCents } from "@/elections/view";
import { CARD_SIZE, NAVY, PAPER, TEAL, fitFontSize, loadPoppins } from "./card";

const PAD = 80;
const TEXT_WIDTH = CARD_SIZE.width - 2 * PAD;
const NAME_SIZES = [96, 80, 68, 58, 50, 44];

async function render(children: ReactNode): Promise<ImageResponse> {
  const font = await loadPoppins();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: NAVY,
        fontFamily: "Poppins",
        color: PAPER,
      }}
    >
      <div style={{ height: 24, backgroundColor: TEAL }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `48px ${PAD}px 56px`,
        }}
      >
        <div style={{ fontSize: 40, color: "white" }}>OpenAlameda</div>
        {children}
        <div style={{ fontSize: 28, opacity: 0.8 }}>openalameda.org</div>
      </div>
    </div>,
    { ...CARD_SIZE, fonts: [{ name: "Poppins", data: font, weight: 600, style: "normal" }] },
  );
}

/** A name that always fits in two lines: sized to its length, then clamped. Satori needs a block for lineClamp. */
function Name({
  text,
  width = TEXT_WIDTH,
  sizes = NAME_SIZES,
}: {
  text: string;
  width?: number;
  sizes?: number[];
}) {
  const size = fitFontSize(text, width, sizes);
  return (
    <div style={{ display: "block", fontSize: size, lineHeight: 1.1, maxWidth: width, lineClamp: 2 }}>
      {text}
    </div>
  );
}

function through(dataThrough: string | undefined): ReactNode {
  return dataThrough ? (
    <div style={{ display: "flex", fontSize: 32, opacity: 0.85 }}>data through {formatDate(dataThrough)}</div>
  ) : (
    <div style={{ display: "flex" }} />
  );
}

/** Election preview: the election's name and how current the data is. */
export function electionCard(opts: { name: string; dataThrough?: string }): Promise<ImageResponse> {
  return render(
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Name text={opts.name} />
      {through(opts.dataThrough)}
    </div>,
  );
}

/** Race preview: the race's name, each candidate's raised as a bar, and the data date. Shows up to six. */
export function raceCard(opts: {
  name: string;
  bars: { name: string; raisedCents: number }[];
  dataThrough?: string;
}): Promise<ImageResponse> {
  const bars = opts.bars.slice(0, 6);
  const max = Math.max(1, ...bars.map((b) => b.raisedCents));
  const labelWidth = 400;
  const barArea = TEXT_WIDTH - labelWidth - 170;
  return render(
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Name text={opts.name} sizes={[72, 60, 52, 44]} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bars.map((b) => (
          <div key={b.name} style={{ display: "flex", alignItems: "center", fontSize: 26 }}>
            <div style={{ display: "block", width: labelWidth, paddingRight: 16, lineClamp: 1 }}>
              {b.name}
            </div>
            <div style={{ display: "flex", width: barArea }}>
              <div
                style={{
                  height: 22,
                  width: Math.max(4, Math.round((b.raisedCents / max) * barArea)),
                  backgroundColor: TEAL,
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ display: "flex", width: 170, justifyContent: "flex-end" }}>
              {formatUsd(b.raisedCents)}
            </div>
          </div>
        ))}
      </div>
      {through(opts.dataThrough)}
    </div>,
  );
}

function CardHeatmap({ summary }: { summary: MoneySummary }) {
  const whole = othersCents(summary);
  const cell = 92;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {LOCALITIES.map((from) => (
        <div key={from} style={{ display: "flex", gap: 6 }}>
          {DONOR_TYPES.map((type) => {
            const cents = summary.matrix[from][type].cents;
            const opacity = whole > 0 ? heatOpacity(cents / whole) : 0;
            return (
              <div
                key={type}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 8,
                  border: "2px solid rgba(250, 247, 242, 0.35)",
                  // The grid sits on navy; teal at low opacity would vanish, so cells lighten toward paper.
                  backgroundColor:
                    opacity > 0 ? `rgba(250, 247, 242, ${0.15 + opacity * 0.85})` : "transparent",
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Candidate preview: name, raised vs. spent, the heatmap and any active slice in words. `summary` is
 * undefined for a candidate with no filings, which skips the figures and grid.
 */
export function candidateCard(opts: {
  name: string;
  summary?: MoneySummary;
  slice?: string | null;
}): Promise<ImageResponse> {
  const s = opts.summary;
  const filed = s !== undefined && s.status === "filed";
  const textWidth = filed ? TEXT_WIDTH - 340 : TEXT_WIDTH;
  return render(
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: textWidth }}>
        <Name text={opts.name} width={textWidth} sizes={[80, 68, 58, 50, 44, 38]} />
        {filed && (
          <div style={{ display: "flex", fontSize: 36 }}>
            {formatUsd(s.raisedCents)} raised · {formatUsd(s.spentCents)} spent
          </div>
        )}
        {opts.slice && (
          <div style={{ display: "flex", fontSize: 28, color: "#9FD8D8" }}>Showing {opts.slice}</div>
        )}
      </div>
      {filed && othersCents(s) > 0 && <CardHeatmap summary={s} />}
    </div>,
  );
}

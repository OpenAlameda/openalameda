import { readFile } from "node:fs/promises";
import type { ReactNode } from "react";
import { ImageResponse } from "next/og";

/** Share-preview size every card renders at. */
export const CARD_SIZE = { width: 1200, height: 630 };

/** The card's side padding, and the width left for text inside it. */
const PAD = 80;
export const TEXT_WIDTH = CARD_SIZE.width - 2 * PAD;
const NAME_SIZES = [96, 80, 68, 58, 50, 44];
/** The default card's title sizes: large for a short title, smaller when it needs two lines. */
const TITLE_SIZES = [104, 72];

// The tokens from src/app/globals.css; satori cannot read CSS variables.
export const NAVY = "#05204E";
export const TEAL = "#0B6E6E";
export const PAPER = "#FAF7F2";

/**
 * The largest of `sizes` (descending) at which `text` fits in two lines of `maxWidth` pixels, by an
 * average-glyph-width estimate that leaves room for word-wrap waste. Falls back to the smallest size;
 * `lineClamp` on the element then cuts what still overflows.
 */
export function fitFontSize(text: string, maxWidth: number, sizes: number[]): number {
  const AVG_GLYPH = 0.65; // em, Poppins SemiBold with margin for wrapping
  const longestWord = Math.max(...text.split(/\s+/).map((w) => w.length));
  // A word cannot wrap, so it must fit on one line by itself.
  const fit = sizes.find((size) => {
    const perLine = Math.floor(maxWidth / (size * AVG_GLYPH));
    return longestWord <= perLine && text.length <= perLine * 2;
  });
  return fit ?? sizes[sizes.length - 1];
}

let poppins: Promise<Buffer> | undefined;

/**
 * Loads the bundled Poppins SemiBold once per process. The `new URL(...,
 * import.meta.url)` form lets Next's file tracing ship the font with the route.
 */
export function loadPoppins(): Promise<Buffer> {
  poppins ??= readFile(new URL("./fonts/Poppins-SemiBold.ttf", import.meta.url)).catch((error) => {
    poppins = undefined;
    throw error;
  });
  return poppins;
}

/** Every card's frame: a teal band, then the wordmark, the card's content and the domain on navy. */
export async function renderCard(children: ReactNode): Promise<ImageResponse> {
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
export function Name({
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

/** The site's standard card: the page title in the card frame. */
export function defaultCard(title: string): Promise<ImageResponse> {
  return renderCard(<Name text={title} sizes={TITLE_SIZES} />);
}

/** Reads a response's whole body, so lazy render failures surface here. */
async function buffered(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`render responded with status ${res.status}`);
  return new Response(await res.arrayBuffer(), { headers: res.headers });
}

/**
 * Runs a card render and, if it throws or its body fails to stream, serves the
 * default card for `title` instead. ImageResponse renders lazily, so a failure
 * only shows up while the body is read; reading it here keeps a broken card
 * from reaching a crawler as a truncated or empty image.
 */
export async function withFallback(
  render: () => Promise<Response> | Response,
  title: string,
): Promise<Response> {
  try {
    return await buffered(await render());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Preview card for "${title}" failed, serving the default card: ${reason}`);
    return buffered(await defaultCard(title));
  }
}

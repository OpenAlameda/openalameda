import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

/** Share-preview size every card renders at. */
export const CARD_SIZE = { width: 1200, height: 630 };

// The tokens from src/app/globals.css; satori cannot read CSS variables.
const NAVY = "#05204E";
const TEAL = "#0B6E6E";
const PAPER = "#FAF7F2";

let poppins: Promise<Buffer> | undefined;

/**
 * Loads the bundled Poppins SemiBold once per process. The `new URL(...,
 * import.meta.url)` form lets Next's file tracing ship the font with the route.
 */
function loadPoppins(): Promise<Buffer> {
  poppins ??= readFile(new URL("./fonts/Poppins-SemiBold.ttf", import.meta.url)).catch((error) => {
    poppins = undefined;
    throw error;
  });
  return poppins;
}

/** The site's standard card: wordmark, page title and domain on navy. */
export async function defaultCard(title: string): Promise<ImageResponse> {
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
      }}
    >
      <div style={{ height: 24, backgroundColor: TEAL }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 80px 64px",
        }}
      >
        <div style={{ fontSize: 44, color: "white" }}>OpenAlameda</div>
        <div
          style={{
            fontSize: 104,
            lineHeight: 1.1,
            color: PAPER,
            maxWidth: CARD_SIZE.width - 160,
            lineClamp: 2,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 30, color: PAPER, opacity: 0.8 }}>openalameda.org</div>
      </div>
    </div>,
    {
      ...CARD_SIZE,
      fonts: [{ name: "Poppins", data: font, weight: 600, style: "normal" }],
    },
  );
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

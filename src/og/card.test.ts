import { afterEach, expect, test, vi } from "vitest";
import { pngSize } from "@/lib/png-size";
import { CARD_SIZE, defaultCard, withFallback } from "./card";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Silences and records the fallback's console.error line. */
function spyOnErrors() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

test("defaultCard renders a 1200x630 PNG", async () => {
  const errors = spyOnErrors();
  const res = await withFallback(() => defaultCard("Elections"), "Elections");
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual(CARD_SIZE);
  expect(errors).not.toHaveBeenCalled();
});

test("a long title renders without falling back", async () => {
  const errors = spyOnErrors();
  const title = "Campaign contributions to every candidate for City Council, November 2026";
  const res = await withFallback(() => defaultCard(title), title);
  expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual(CARD_SIZE);
  expect(errors).not.toHaveBeenCalled();
});

test("a throwing render falls back to the default card", async () => {
  const errors = spyOnErrors();
  const res = await withFallback(() => {
    throw new Error("boom");
  }, "About");
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 });
  expect(errors).toHaveBeenCalledOnce();
  expect(String(errors.mock.calls[0][0])).toContain("About");
});

test("a render whose body fails to stream falls back too", async () => {
  const errors = spyOnErrors();
  const broken = new Response(
    new ReadableStream({
      start(c) {
        c.error(new Error("font"));
      },
    }),
    { headers: { "content-type": "image/png" } },
  );
  const res = await withFallback(() => broken, "About");
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 });
  expect(errors).toHaveBeenCalledOnce();
  expect(String(errors.mock.calls[0][0])).toContain("About");
});

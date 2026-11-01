import { afterEach, describe, expect, it, test, vi } from "vitest";
import { pngSize } from "@/lib/png-size";
import { CARD_SIZE, defaultCard, fitFontSize, withFallback } from "./card";

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

const SIZES = [88, 72, 60, 52, 44];

describe("fitFontSize", () => {
  it("keeps short names large", () => {
    expect(fitFontSize("Mayor", 1040, SIZES)).toBe(88);
  });
  it("shrinks the longest names so two lines hold them", () => {
    const long = "Alameda Climate Change Belivers Opposing Measure L 2026";
    const size = fitFontSize(long, 1040, SIZES);
    expect(size).toBeLessThan(72);
    expect(long.length).toBeLessThanOrEqual(Math.floor(1040 / (size * 0.65)) * 2);
  });
  it("shrinks monotonically with length", () => {
    const a = fitFontSize("Thushan Amarasiriwardena", 1040, SIZES);
    const b = fitFontSize("Mayor", 1040, SIZES);
    expect(a).toBeLessThanOrEqual(b);
  });
  it("shrinks until a long single word fits on one line", () => {
    const size = fitFontSize("Thushan Amarasiriwardena", 860, SIZES);
    expect("Amarasiriwardena".length * size * 0.65).toBeLessThanOrEqual(860);
  });
  it("falls back to the smallest size for absurd input", () => {
    expect(fitFontSize("x".repeat(500), 1040, SIZES)).toBe(44);
  });
});

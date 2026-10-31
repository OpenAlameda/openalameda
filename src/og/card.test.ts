import { describe, expect, it } from "vitest";
import { fitFontSize } from "./card";

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

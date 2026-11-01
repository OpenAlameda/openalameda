import { describe, expect, it } from "vitest";
import { candidateCard, electionCard, raceCard } from "./election-cards";

// Rendering to bytes proves satori accepts the layout, including the longest names.
async function png(res: Promise<Response>): Promise<Uint8Array> {
  const r = await res;
  expect(r.headers.get("content-type")).toBe("image/png");
  return new Uint8Array(await r.arrayBuffer());
}

describe("election cards", () => {
  it("render with the longest names", async () => {
    const measure = "Alameda Climate Change Belivers Opposing Measure L 2026";
    const bytes = await Promise.all([
      png(electionCard({ name: "November 3, 2026 General Election", dataThrough: "2026-10-22" })),
      png(
        raceCard({
          name: "Measure L",
          bars: [
            { name: measure, raisedCents: 12345 },
            { name: "Thushan Amarasiriwardena", raisedCents: 0 },
          ],
          dataThrough: "2026-10-22",
        }),
      ),
      png(candidateCard({ name: "Thushan Amarasiriwardena", slice: "individuals from Alameda" })),
      png(candidateCard({ name: measure })),
    ]);
    for (const b of bytes) expect(b.length).toBeGreaterThan(1000);
  });
});

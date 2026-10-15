import { describe, expect, it } from "vitest";
import { nearbyMapLines, nearbyCoordinates } from "../src/domain/nearby-map";
import type { Sample } from "../src/domain/types";
const p = (lng: number, segment = 0): Sample => ({
  lat: 0,
  lng,
  t: 0,
  accuracy: 5,
  segment,
});
describe("local map overlays", () => {
  it("excludes distant routes without joining gaps or GPS segments", () => {
    const lines = nearbyMapLines(
      [[p(0), p(0.001), p(10), p(0.002), p(0.003), p(0.004, 1), p(0.005, 1)]],
      p(0),
    );
    expect(lines.map((line) => line.map((x) => x.lng))).toEqual([
      [0, 0.001],
      [0.002, 0.003],
      [0.004, 0.005],
    ]);
  });
  it("bounds render payloads and excludes remote cells", () => {
    const lines = nearbyMapLines(
      Array.from({ length: 30 }, () => [p(0), p(0.001)]),
      p(0),
      12000,
      10,
    );
    expect(lines.flat()).toHaveLength(10);
    expect(nearbyCoordinates([p(0), p(1), p(0.01)], p(0))).toEqual([
      p(0),
      p(0.01),
    ]);
  });
});

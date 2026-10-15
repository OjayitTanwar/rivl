import { describe, it, expect } from "vitest";
import { routePreviewPath } from "../src/domain/route-preview";
import type { Sample } from "../src/domain/types";
const p = (lat: number, lng: number, segment = 0): Sample => ({
  lat,
  lng,
  segment,
  t: 0,
  accuracy: 0,
});
describe("bounded route previews", () => {
  it("bounds a multi-hour track without spread argument limits", () => {
    const points = Array.from({ length: 300000 }, (_, i) =>
      p(25 + i / 1e6, 72 + Math.sin(i / 1000) / 100),
    );
    const path = routePreviewPath(points);
    expect(path.split(" ").length).toBeLessThanOrEqual(256);
    expect(path).not.toMatch(/NaN|Infinity/);
  });
  it("does not connect privacy gaps, even when the segment boundary was skipped", () => {
    const points = Array.from({ length: 1000 }, (_, i) =>
      p(25 + i / 10000, 72, i < 501 ? 0 : 1),
    );
    expect(routePreviewPath(points, 320, 180, 20).match(/M/g)).toHaveLength(2);
  });
  it("breaks the line at invalid data and handles empty or stationary routes", () => {
    expect(routePreviewPath([])).toBe("");
    expect(routePreviewPath([p(0, 0), p(NaN, 1), p(0, 2)])).toMatch(/^M.* M/);
    expect(routePreviewPath([p(25, 72), p(25, 72)])).not.toMatch(
      /NaN|Infinity/,
    );
  });
  it("uses the short crossing at the date line and preserves aspect ratio", () => {
    const normal = routePreviewPath([p(0, -0.1), p(0.1, 0.1)]);
    const wrapped = routePreviewPath([p(0, 179.9), p(0.1, -179.9)]);
    expect(wrapped).toBe(normal);
  });
});

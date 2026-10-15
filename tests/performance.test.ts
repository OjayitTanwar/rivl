import { it, expect } from "vitest";
import { chartSamples } from "../src/domain/display";
import { processActivity } from "../src/domain/processing";
import { simplify } from "../src/domain/geo";
it("bounds chart geometry for a day-long sensor stream while retaining spikes", () => {
  const raw = Array.from({ length: 86400 }, (_, i) => 150 + Math.sin(i / 20));
  raw[43210] = 210;
  const display = chartSamples(raw);
  expect(display.length).toBeLessThanOrEqual(512);
  expect(display.some((p) => p.value === 210)).toBe(true);
  expect(
    display.every((p, i) => i === 0 || p.index > display[i - 1]!.index),
  ).toBe(true);
});
it("processes a four-hour one-second track with complete distance and bounded display geometry", () => {
  const raw = Array.from({ length: 14401 }, (_, i) => ({
    lat: 0,
    lng: i * 0.000025,
    t: i * 1000,
    accuracy: 4,
    segment: 0,
    hr: 140,
  }));
  const summary = processActivity(raw, "run", 0, 14400000);
  expect(summary.moving).toBe(14400);
  expect(summary.distance).toBeCloseTo(40030.23, 0);
  expect(simplify(raw)).toHaveLength(2);
});

import { describe, expect, it } from "vitest";
import {
  heartRateZone,
  isValidHeartRateZoneThresholds,
} from "../src/domain/heart-rate-zones";
import { processActivity, zone } from "../src/domain/processing";
import { analyzeRange } from "../src/domain/activity-ranges";
import type { Sample } from "../src/domain/types";
const thresholds: [number, number, number, number] = [100, 130, 160, 180];
const points = (hr?: number): Sample[] =>
  Array.from({ length: 13 }, (_, i) => ({
    lat: 0,
    lng: i * 0.0001,
    accuracy: 4,
    segment: 0,
    t: 100000 + i * 5000,
    hr,
  }));
describe("personal heart-rate zones", () => {
  it("uses inclusive boundaries and bounded edge zones", () => {
    expect(
      [30, 99, 100, 129, 130, 159, 160, 179, 180, 240].map((hr) =>
        heartRateZone(hr, 190, thresholds),
      ),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("requires four increasing integer boundaries within the saved maximum", () => {
    expect(isValidHeartRateZoneThresholds(thresholds, 190)).toBe(true);
    for (const value of [
      null,
      [100, 130],
      [100, 130, 130, 180],
      [29, 100, 130, 180],
      [100, 130, 160, 191],
      [100, 130, 160.5, 180],
      [100, 130, 160, Infinity],
    ])
      expect(isValidHeartRateZoneThresholds(value, 190)).toBe(false);
  });
  it("keeps the original default formula when no personal zones are configured", () => {
    for (let hr = 30; hr <= 240; hr++)
      expect(zone(hr, 190)).toBe(
        Math.min(4, Math.max(0, Math.floor((hr / 190 - 0.5) * 10))),
      );
    expect(heartRateZone(150, NaN)).toBe(heartRateZone(150, 190));
  });
  it("snapshots boundaries and applies them to measured minutes and range analysis", () => {
    const summary = processActivity(
      points(150),
      "run",
      100000,
      160000,
      190,
      5,
      thresholds,
    );
    expect(summary.zones).toEqual([0, 0, 60, 0, 0]);
    expect(summary.load).toBe(3);
    expect(summary.loadMethod).toBe("hr-zones");
    expect(summary.hrZoneThresholds).toEqual(thresholds);
    expect(summary.hrZoneThresholds).not.toBe(thresholds);
    expect(summary.hrZoneMaxHR).toBe(190);
    expect(
      analyzeRange(points(150), 0, 12, "run", 190, thresholds).summary.zones,
    ).toEqual(summary.zones);
  });
  it("preserves duration times RPE and missing readings", () => {
    const summary = processActivity(
      points(),
      "run",
      100000,
      160000,
      190,
      7,
      thresholds,
    );
    expect(summary.avgHR).toBeNull();
    expect(summary.zones).toEqual([0, 0, 0, 0, 0]);
    expect(summary.loadMethod).toBe("duration-rpe");
    expect(summary.load).toBe(7);
  });
  it("falls back from invalid boundaries without generating bad totals", () => {
    expect(
      processActivity(
        points(150),
        "run",
        100000,
        160000,
        190,
        5,
        [100, 100, 160, 180],
      ).zones,
    ).toEqual(processActivity(points(150), "run", 100000, 160000).zones);
  });
});

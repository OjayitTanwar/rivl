import { it, expect } from "vitest";
import {
  asleepHours,
  hrvBaseline,
  recoveryInsight,
} from "../src/services/health-types";
it("weights HRV by day instead of by number of device readings", () => {
  const readings = [
    { t: new Date(2026, 9, 8, 8).getTime(), value: 80 },
    { t: new Date(2026, 9, 7, 8).getTime(), value: 20 },
    { t: new Date(2026, 9, 7, 9).getTime(), value: 20 },
    { t: new Date(2026, 9, 6, 8).getTime(), value: 60 },
  ];
  expect(hrvBaseline(readings)).toMatchObject({
    hrv: 80,
    baselineHRV: 40,
    sampleDays: 2,
  });
});
it("unions overlapping sleep sources and clips the reporting window", () => {
  const h = 3600000;
  expect(
    asleepHours(
      [
        { start: 0, end: 4 * h },
        { start: 2 * h, end: 6 * h },
        { start: 8 * h, end: 9 * h },
      ],
      h,
      8.5 * h,
    ),
  ).toBe(5.5);
  expect(asleepHours([], 0, h)).toBeNull();
});
it("does not explain stale HRV as today's readiness", () => {
  expect(
    recoveryInsight(
      {
        source: "HealthKit",
        readAt: 200000000,
        measuredAt: 1,
        restingHR: 50,
        hrv: 30,
        baselineHRV: 60,
        sampleDays: 10,
        sleepHours: null,
      },
      200000000,
    ),
  ).toContain("No recent HRV");
});

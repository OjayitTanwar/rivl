import { describe, it, expect } from "vitest";
import {
  utcDateWindow,
  compareSegmentPeriods,
  deviceSegmentStandings,
} from "../src/domain/segment-history";
import type { SegmentEffort } from "../src/domain/types";
const effort = (
  id: string,
  seconds: number,
  date: number,
  athleteId = "me",
): SegmentEffort => ({
  id,
  seconds,
  date,
  athleteId,
  segmentId: "hill",
  athlete: "Athlete",
  age: null,
  previous: null,
  expected: null,
  friend: false,
  checked: true,
});
describe("segment period comparison", () => {
  it("uses inclusive entered dates with exclusive UTC end and rejects invalid calendars", () => {
    const range = utcDateWindow("2024-02-29", "2024-02-29");
    expect(range.until - range.since).toBe(86400000);
    for (const date of ["2025-02-29", "2026-02-30", "10/10/2026", "2026-13-01"])
      expect(() => utcDateWindow(date, date)).toThrow();
    expect(() => utcDateWindow("2026-10-14", "2026-10-13")).toThrow();
  });
  it("compares each athlete's best without fabricating a missing period", () => {
    const before = deviceSegmentStandings([effort("a", 100, 1)], "me", "hill");
    const after = deviceSegmentStandings([effort("b", 80, 2)], "me", "hill");
    expect(compareSegmentPeriods(before, after)[0]?.improvement).toBeCloseTo(
      20,
    );
    expect(compareSegmentPeriods([], after)[0]).toMatchObject({
      before: null,
      after: 80,
      improvement: null,
    });
  });
  it("keeps device-only results owner scoped, bounded by dates, deduplicated and unverified", () => {
    const rows = deviceSegmentStandings(
      [
        effort("a", 100, 1),
        effort("a", 100, 1),
        effort("b", 80, 2),
        effort("c", 20, 3),
        effort("x", 10, 2, "other"),
      ],
      "me",
      "hill",
      1,
      3,
    );
    expect(rows).toEqual([
      {
        athleteId: "me",
        athlete: "Athlete",
        seconds: 80,
        date: 2,
        count: 2,
        checked: false,
      },
    ]);
  });
});

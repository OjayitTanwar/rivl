import { describe, expect, it } from "vitest";
import { observedHeartRateLog } from "../src/domain/observed-heart-rate";
import { processActivity } from "../src/domain/processing";
import type { Activity, Sample } from "../src/domain/types";
const start = 1700000000000;
function workout(
  readings: (number | undefined)[],
  patch: Partial<Activity> = {},
): Activity {
  const route: Sample[] = readings.map((hr, i) => ({
    t: start + i * 5000,
    hr,
    lat: 0,
    lng: 0,
    segment: 0,
    accuracy: 5,
  }));
  return {
    id: "a",
    ownerId: "me",
    title: "Run",
    sport: "run",
    startedAt: start,
    endedAt: start + readings.length * 5000,
    summary: processActivity(
      route,
      "run",
      start,
      start + readings.length * 5000,
    ),
    route,
    visibility: "private",
    note: "",
    rpe: 5,
    sync: "local",
    revision: 1,
    photos: [],
    ...patch,
  };
}
describe("automatic recorded heart-rate log", () => {
  it("logs stable peaks automatically without altering activity samples or summaries", () => {
    const activity = workout([170, 172, 174, 240, 180, 181, 182]);
    const before = JSON.stringify(activity);
    expect(observedHeartRateLog([activity], "me")).toEqual([
      { activityId: "a", at: start + 30000, bpm: 180 },
    ]);
    expect(JSON.stringify(activity)).toBe(before);
  });
  it("excludes isolated spikes, missing readings and insufficient duration", () => {
    for (const values of [
      [220],
      [220, 220],
      [170, 240, 170],
      [180, undefined, 180],
      [NaN, Infinity, 250],
    ])
      expect(observedHeartRateLog([workout(values)], "me")).toEqual([]);
  });
  it("breaks on pauses, nonmonotonic timestamps and long gaps", () => {
    for (const mutate of [
      (s: Sample[]) => {
        s[2]!.segment = 1;
      },
      (s: Sample[]) => {
        s[1]!.t = s[0]!.t;
      },
      (s: Sample[]) => {
        s[2]!.t += 11000;
      },
    ]) {
      const a = workout([180, 180, 180]);
      mutate(a.route);
      expect(observedHeartRateLog([a], "me")).toEqual([]);
    }
  });
  it("excludes other owners and simulated workouts", () => {
    for (const patch of [
      { ownerId: "other" },
      { demo: true },
      { simulated: true },
    ])
      expect(
        observedHeartRateLog([workout([180, 180, 180], patch)], "me"),
      ).toEqual([]);
  });
  it("recomputes after deletion and edits rather than keeping stale maxima", () => {
    const a = workout([200, 201, 202]),
      b = workout([170, 170, 170], { id: "b" });
    expect(observedHeartRateLog([a, b], "me")).toHaveLength(2);
    expect(observedHeartRateLog([b], "me")[0]?.bpm).toBe(170);
    expect(observedHeartRateLog([{ ...a, route: [] }], "me")).toEqual([]);
  });
});

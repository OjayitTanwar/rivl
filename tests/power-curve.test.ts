import { describe, expect, it } from "vitest";
import {
  recordedCyclingPowerCurve,
  RECORDED_POWER_POLICY,
} from "../src/domain/power-curve";
import type { Activity, Sample } from "../src/domain/types";
const startedAt = 100000;
const activity = {
  id: "ride",
  ownerId: "me",
  sport: "ride",
  startedAt,
  endedAt: startedAt + 2000000,
  demo: false,
  simulated: false,
} as Activity;
const sample = (second: number, watts?: number, segment = 0): Sample => ({
  t: startedAt + second * 1000,
  watts,
  segment,
  lat: 0,
  lng: 0,
  accuracy: 1,
});
const result = (samples: Sample[]) =>
  recordedCyclingPowerCurve(activity, samples, "me").windows;
const watts = (samples: Sample[], seconds = 5) =>
  result(samples).find((w) => w.seconds === seconds)?.watts;
describe("Raw cycling power curves", () => {
  it("computes all requested sustained durations from continuous recorded readings", () => {
    const points = Array.from({ length: 1201 }, (_, i) => sample(i, 250));
    expect(result(points).map((w) => w.watts)).toEqual([
      250, 250, 250, 250, 250,
    ]);
    expect(result(points)[4]).toMatchObject({
      start: startedAt,
      end: startedAt + 1200000,
    });
  });
  it("keeps actual zero distinct from unavailable or isolated readings", () => {
    expect(watts(Array.from({ length: 6 }, (_, i) => sample(i, 0)))).toBe(0);
    expect(watts([sample(0, 300)])).toBeNull();
    expect(watts(Array.from({ length: 10 }, (_, i) => sample(i)))).toBeNull();
  });
  it("weights irregular readings by measured time and finds interior-window boundaries", () => {
    const samples = [
      sample(0, 100),
      sample(1.5, 300),
      sample(3, 300),
      sample(5, 0),
      sample(6, 0),
    ];
    expect(watts(samples)).toBe(240);
    expect(result(samples)[0]).toMatchObject({
      start: startedAt,
      end: startedAt + 5000,
    });
  });
  it("does not bridge pauses segment changes sparse samples or sensor gaps", () => {
    expect(
      watts([
        sample(0, 300),
        sample(2, 300),
        sample(4, 300),
        sample(6, 300, 1),
        sample(8, 300, 1),
      ]),
    ).toBeNull();
    expect(watts([sample(0, 300), sample(5, 300), sample(10, 300)])).toBeNull();
    expect(
      watts([sample(0, 300), sample(1, 300), sample(20, 300), sample(21, 300)]),
    ).toBeNull();
  });
  it("requires both interval endpoints to have valid power and never fills missing watts", () => {
    for (const invalid of [undefined, NaN, Infinity, -1, 5001]) {
      const samples = Array.from({ length: 6 }, (_, i) =>
        sample(i, i === 5 ? invalid : 300),
      );
      expect(watts(samples)).toBeNull();
    }
  });
  it("breaks duplicate reversed invalid timestamps and ignores later rollback samples until catchup", () => {
    expect(
      watts([
        sample(0, 100),
        sample(1, 100),
        sample(2, 100),
        sample(2, 100),
        sample(3, 100),
        sample(4, 100),
        sample(5, 100),
      ]),
    ).toBeNull();
    const malformed = [
      sample(0, 100),
      sample(1, 100),
      { ...sample(2, 100), t: NaN },
      sample(3, 100),
      sample(4, 100),
      sample(5, 100),
    ];
    expect(watts(malformed)).toBeNull();
    expect(
      watts([
        sample(0, 100),
        sample(2, 100),
        sample(4, 100),
        sample(1, 900),
        sample(2, 900),
        sample(3, 900),
        sample(4, 900),
        sample(5, 900),
        sample(6, 900),
      ]),
    ).toBeNull();
  });
  it("enforces raw owner cycling genuine-source eligibility and activity time bounds", () => {
    const samples = Array.from({ length: 6 }, (_, i) => sample(i, 200));
    for (const changed of [
      { ownerId: "other" },
      { sport: "run" },
      { demo: true },
      { simulated: true },
    ])
      expect(
        recordedCyclingPowerCurve(
          { ...activity, ...changed } as Activity,
          samples,
          "me",
        ).status,
      ).toBe("not_eligible");
    expect(watts(samples.map((p) => ({ ...p, t: p.t - 200000 })))).toBeNull();
    expect(recordedCyclingPowerCurve(activity, samples, undefined).status).toBe(
      "not_eligible",
    );
  });
  it("rejects over-budget tracks rather than truncating and misrepresenting the best", () => {
    const points = Array(RECORDED_POWER_POLICY.maxSamples + 1).fill(
      sample(0, 900),
    ) as Sample[];
    expect(recordedCyclingPowerCurve(activity, points, "me")).toMatchObject({
      status: "limit",
    });
    expect(result(points).every((w) => w.watts === null)).toBe(true);
  });
});

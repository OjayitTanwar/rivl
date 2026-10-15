import { describe, it, expect } from "vitest";
import {
  powerCurve,
  powerZones,
  powerDistribution,
} from "../src/domain/power-analysis";
import type { Sample } from "../src/domain/types";
const sample = (t: number, watts?: number): Sample => ({
  lat: 0,
  lng: 0,
  t,
  accuracy: 1,
  segment: 0,
  watts,
});
describe("power curve", () => {
  it("finds the best rolling measured interval", () => {
    const points = Array.from({ length: 91 }, (_, i) =>
      sample(i * 1000, i < 20 ? 100 : 250),
    );
    expect(powerCurve(points).find((p) => p.seconds === 60)?.watts).toBe(250);
  });
  it("does not bridge sensor gaps or invent power", () => {
    expect(
      powerCurve([
        sample(0, 200),
        sample(1000, 200),
        sample(20_000, 400),
        sample(21_000, 400),
      ]).filter((p) => p.seconds >= 5),
    ).toEqual([]);
    expect(powerCurve([sample(0), sample(1000)])).toEqual([]);
  });
  it("weights irregular readings by time and excludes paused intervals", () => {
    const points = [
      sample(0, 100),
      sample(1500, 300),
      sample(5000, 0),
      { ...sample(6000, 500), segment: 1 },
      { ...sample(7000, 500), segment: 1 },
    ];
    expect(powerCurve(points).find((p) => p.seconds === 5)).toMatchObject({
      watts: 240,
      start: 0,
      end: 5000,
    });
    expect(powerDistribution(points)).toEqual([
      { watts: 100, seconds: 1.5 },
      { watts: 300, seconds: 3.5 },
      { watts: 500, seconds: 1 },
    ]);
  });
  it("counts measured seconds in FTP zones without bridging gaps", () => {
    const points = [
      sample(0, 100),
      sample(1000, 180),
      sample(2000, 220),
      sample(12_000, 500),
      sample(13_000, 500),
    ];
    expect(powerZones(points, 200)).toEqual([1, 0, 0, 1, 0, 0, 1]);
  });
});

import { describe, it, expect } from "vitest";
import { processActivity, zone } from "../src/domain/processing";
import {
  distance,
  redactRoute,
  encodeSamples,
  decodeSamples,
  simplify,
  publicationPoints,
} from "../src/domain/geo";
import {
  trainingHistory,
  coachFacts,
  predictRace,
} from "../src/domain/analytics";
import type { Sample } from "../src/domain/types";
const straight = (count = 101): Sample[] =>
  Array.from({ length: count }, (_, i) => ({
    lat: 0,
    lng: i * 0.0001,
    t: 100000 + i * 5000,
    accuracy: 4,
    altitude: 20,
    hr: 150,
    segment: 0,
  }));
describe("activity processing", () => {
  it("uses geodesic distance and correctly interpolates kilometre splits", () => {
    const raw = straight(),
      s = processActivity(raw, "run", 100000, 600000);
    expect(s.distance).toBeCloseTo(1111.95, 0);
    expect(s.moving).toBe(500);
    expect(s.splits).toHaveLength(2);
    expect(s.splits[0]!.distance).toBe(1000);
    expect(s.splits.reduce((n, x) => n + x.seconds, 0)).toBeCloseTo(s.moving);
    expect(s.bests.find((e) => e.distance === 1000)?.seconds).toBeCloseTo(
      449.66,
      0,
    );
  });
  it("does not bridge pauses or missing GPS", () => {
    const raw = straight(5);
    raw[3]!.segment = 1;
    raw[4]!.segment = 1;
    const s = processActivity(raw, "run", 100000, 120000);
    expect(s.moving).toBe(15);
    expect(s.distance).toBeCloseTo(distance(raw[0]!, raw[1]!) * 3);
  });
  it("rejects inaccurate fixes, teleports and duplicate timestamps", () => {
    const raw = straight(5);
    raw.splice(
      2,
      0,
      { ...raw[1]!, lng: 50, t: 107000 },
      { ...raw[1]!, accuracy: 200, t: 108000 },
      { ...raw[1]! },
    );
    const s = processActivity(raw, "run", 100000, 120000);
    expect(s.rejected).toBe(3);
    expect(s.distance).toBeLessThan(100);
  });
  it("does not award best efforts across a long missing interval", () => {
    const raw = straight(201).map((p, i) => ({
      ...p,
      t: p.t + (i > 100 ? 120000 : 0),
    }));
    const s = processActivity(raw, "run", 100000, 2000000);
    expect(s.bests.some((e) => e.distance === 1609.344)).toBe(false);
  });
  it("handles no data and missing HR without fake values", () => {
    const s = processActivity([], "walk", 1000, 2000);
    expect(s.avgHR).toBe(null);
    expect(s.distance).toBe(0);
    expect(s.load).toBe(0);
    expect(Number.isFinite(s.avgPace)).toBe(true);
  });
  it("weights HR load by sample duration", () => {
    const raw = straight();
    const s = processActivity(raw, "run", 100000, 600000, 200);
    expect(s.avgHR).toBe(150);
    expect(s.zones.reduce((a, b) => a + b, 0)).toBe(500);
    expect(s.load).toBeCloseTo(25);
    expect(zone(240, 190)).toBe(4);
  });
});
describe("privacy and raw storage", () => {
  it("splits redacted geometry instead of connecting through a privacy zone", () => {
    const raw = straight(101),
      lines = redactRoute(
        raw,
        [{ id: "home", label: "Home", lat: 0, lng: 0.005, radius: 150 }],
        0,
      );
    expect(lines.length).toBe(2);
    for (const l of lines)
      for (const p of l)
        expect(distance(p, { lat: 0, lng: 0.005 })).toBeGreaterThanOrEqual(150);
  });
  it("retains coordinates and optional sensor data through delta encoding", () => {
    const raw = straight();
    const decoded = decodeSamples(encodeSamples(raw));
    decoded.forEach((p, i) => {
      expect(p.lng).toBeCloseTo(raw[i]!.lng, 7);
      expect(p.t).toBe(raw[i]!.t);
      expect(p.hr).toBe(raw[i]!.hr);
    });
  });
  it("simplifies a straight track to endpoints", () =>
    expect(simplify(straight())).toHaveLength(2));
});
describe("training analytics", () => {
  it("includes rest days in fitness decay", () => {
    const h = trainingHistory([], 10, Date.now());
    expect(h).toHaveLength(10);
    expect(h.every((d) => d.fitness === 0)).toBe(true);
  });
  it("does not manufacture race predictions or efficiency", () => {
    expect(predictRace([])).toBe(null);
    expect(coachFacts([]).efficiencyChange).toBe(null);
  });
});

it("does not connect a sparse route across a privacy zone with no recorded fix inside", () => {
  const raw = [0, 0.001, 0.009, 0.01].map((lng, i) => ({
    lat: 0,
    lng,
    t: i * 1000,
    accuracy: 5,
    segment: 0,
  }));
  const lines = redactRoute(
    raw,
    [{ id: "home", label: "Home", lat: 0, lng: 0.005, radius: 200 }],
    0,
  );
  expect(lines).toHaveLength(2);
  expect(lines[0]!.at(-1)!.lng).toBe(0.001);
  expect(lines[1]![0]!.lng).toBe(0.009);
});

it("retains a visible middle section when publishing a straight route", () => {
  const raw = straight(101);
  const published = redactRoute(publicationPoints(raw), []);
  expect(published.length).toBe(1);
  expect(published[0]!.length).toBeGreaterThan(2);
  expect(distance(published[0]![0]!, raw[0]!)).toBeGreaterThanOrEqual(200);
});

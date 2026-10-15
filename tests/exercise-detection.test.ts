import { describe, it, expect } from "vitest";
import {
  ExerciseDetector,
  exerciseMotionMatches,
} from "../src/domain/exercise-detection";
import type { Sample } from "../src/domain/types";
const start = 100000;
const point = (i: number, metresPerSecond = 3, accuracy = 5): Sample => ({
  lat: 0,
  lng: (i * 10 * metresPerSecond) / 111195,
  t: start + i * 10000,
  accuracy,
  segment: 0,
});
describe("Opt-in movement gate", () => {
  it("requires sustained movement instead of starting from one location", () => {
    const gate = new ExerciseDetector("run");
    for (let i = 0; i < 9; i++)
      expect(gate.push(point(i), point(i).t)).toBe(false);
    expect(gate.push(point(9), point(9).t)).toBe(true);
  });
  it("rejects stationary drift, fast traffic and poor GPS", () => {
    for (const [velocity, accuracy] of [
      [0.1, 5],
      [20, 5],
      [3, 40],
    ]) {
      const gate = new ExerciseDetector("ride");
      for (let i = 0; i < 20; i++)
        expect(gate.push(point(i, velocity, accuracy), point(i).t)).toBe(false);
    }
  });
  it("resets after gaps or stale readings and ignores duplicates", () => {
    const gate = new ExerciseDetector("run");
    for (let i = 0; i < 8; i++) gate.push(point(i), point(i).t);
    expect(gate.push(point(7), point(7).t)).toBe(false);
    expect(gate.push(point(11), point(11).t)).toBe(false);
    expect(gate.push(point(12), point(12).t + 60000)).toBe(false);
    expect(gate.push(point(13), point(13).t)).toBe(false);
  });
  it("does not mislabel GPS movement as a transport classifier", () => {
    // Slow traffic can pass the ride gate. The selected sport and UI disclosure are required.
    const gate = new ExerciseDetector("ride");
    let detected = false;
    for (let i = 0; i < 10; i++) detected = gate.push(point(i, 5), point(i).t);
    expect(detected).toBe(true);
  });
});

it("requires matching confident exercise and rejects ambiguous vehicle signals", () => {
  const riding = {
    walking: false,
    running: false,
    cycling: true,
    automotive: false,
    stationary: false,
    unknown: false,
    confidence: 2,
  };
  expect(exerciseMotionMatches("ride", riding)).toBe(true);
  expect(exerciseMotionMatches("run", riding)).toBe(false);
  expect(exerciseMotionMatches("ride", { ...riding, automotive: true })).toBe(
    false,
  );
  expect(exerciseMotionMatches("ride", { ...riding, confidence: 0 })).toBe(
    false,
  );
  expect(exerciseMotionMatches("ride", null)).toBe(false);
});

it("retains enough time when iOS delivers frequent fixes", () => {
  const gate = new ExerciseDetector("run");
  let detected = false;
  for (let i = 0; i <= 90; i++) {
    const p = { ...point(0), t: start + i * 1000, lng: (i * 3) / 111195 };
    detected = gate.push(p, p.t);
  }
  expect(detected).toBe(true);
});

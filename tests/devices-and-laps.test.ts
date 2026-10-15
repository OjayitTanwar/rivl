import { it, expect } from "vitest";
import {
  heartRateMeasurement,
  cyclingPowerMeasurement,
  SensorReadings,
} from "../src/domain/sensor-measurements";
import { decodeWatchWorkout } from "../src/domain/watch-workout";
import { defaultProfile } from "../src/services/seed";
import { MemoryDatabase } from "../src/storage/port";
import { RecordingEngine } from "../src/services/recorder-engine";
import { analyzeRange, recordedLaps } from "../src/domain/activity-ranges";
import { heatmapCells } from "../src/domain/heatmap";
const point = (i: number) => ({
  lat: 0,
  lng: i * 0.00001,
  t: 100000 + i * 1000,
  accuracy: 4,
  segment: 0,
  watts: 200,
  hr: 150,
});
it("decodes 8/16-bit heart rate, contact loss, truncated and signed power packets", () => {
  expect(heartRateMeasurement(new Uint8Array([0, 150]))).toBe(150);
  expect(heartRateMeasurement(new Uint8Array([1, 180, 0]))).toBe(180);
  expect(heartRateMeasurement(new Uint8Array([4, 150]))).toBeNull();
  expect(heartRateMeasurement(new Uint8Array([1, 150]))).toBeNull();
  expect(cyclingPowerMeasurement(new Uint8Array([0, 0, 250, 0]))).toBe(250);
  expect(cyclingPowerMeasurement(new Uint8Array([0, 0, 255, 255]))).toBeNull();
  expect(cyclingPowerMeasurement(new Uint8Array([0, 0]))).toBeNull();
});
it("uses only fresh past readings from this athlete and clears disconnected devices", () => {
  const readings = new SensorReadings();
  readings.add("strap", "a", "hr", 150, 1000);
  readings.add("meter", "b", "watts", 200, 2000);
  expect(readings.at("a", 0)).toEqual({});
  expect(readings.at("a", 2000)).toEqual({ hr: 150 });
  expect(readings.at("a", 7000)).toEqual({});
  readings.disconnect("strap");
  expect(readings.at("a", 2000)).toEqual({});
});
it("lap marks survive restart and preserve paused gaps", async () => {
  const db = new MemoryDatabase(),
    engine = new RecordingEngine(db);
  await engine.begin({
    id: "lap",
    ownerId: "a",
    sport: "run",
    startedAt: 100000,
    state: "recording",
    segment: 0,
    autoPause: false,
    simulation: true,
  });
  await engine.ingest([point(0), point(1), point(2)]);
  await engine.markLap();
  await engine.pause();
  await expect(engine.markLap()).rejects.toThrow("Resume");
  const recovered = new RecordingEngine(db);
  await recovered.resume();
  await recovered.ingest([point(5), point(6), point(7)]);
  await recovered.markSaving();
  const activity = await recovered.save(defaultProfile("a"), "Laps", "", 4);
  expect(activity.summary.laps).toHaveLength(2);
  expect(activity.summary.laps?.reduce((s, l) => s + l.seconds, 0)).toBe(
    activity.summary.moving,
  );
  expect(activity.summary.laps?.[1]?.seconds).toBe(2);
});
it("range and lap analysis need no elevation sensor and do not reconnect pauses", () => {
  const points = [
    point(0),
    point(1),
    point(2),
    { ...point(8), segment: 1 },
    { ...point(9), segment: 1 },
  ];
  expect(analyzeRange(points, 4, 0, "run").summary.moving).toBe(3);
  expect(recordedLaps(points, [102000, 102000], "run")).toHaveLength(2);
});
it("imports validated watch samples privately with stable IDs and laps", () => {
  const profile = defaultProfile("a"),
    data = {
      version: 1,
      id: "10000000-0000-4000-8000-000000000001",
      ownerId: "a",
      sport: "run",
      startedAt: 100000,
      endedAt: 104000,
      points: [0, 1, 2, 3, 4].map(point),
      laps: [102000],
    };
  const result = decodeWatchWorkout(data, profile, 200000);
  expect(result.activity.id).toBe(data.id);
  expect(result.activity.visibility).toBe("private");
  expect(result.activity.summary.laps).toHaveLength(2);
  expect(() =>
    decodeWatchWorkout({ ...data, ownerId: "b" }, profile, 200000),
  ).toThrow();
  expect(() =>
    decodeWatchWorkout(
      { ...data, points: [point(0), { ...point(1), hr: 999 }] },
      profile,
      200000,
    ),
  ).toThrow();
  expect(() =>
    decodeWatchWorkout({ ...data, endedAt: 300000 }, profile, 200000),
  ).toThrow();
});
it("heat density counts activities instead of repeated GPS samples", () => {
  const cells = heatmapCells([[point(0), point(0), point(1)], [point(0)]]);
  expect(cells).toHaveLength(1);
  expect(cells[0]?.visits).toBe(2);
});

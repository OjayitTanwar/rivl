import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { RecordingEngine } from "../src/services/recorder-engine";
import { defaultProfile } from "../src/services/default-profile";
import { decodeWatchWorkout } from "../src/domain/watch-workout";
import { editActivityMetadata } from "../src/domain/activity-edit";
import type { Recording, Sample } from "../src/domain/types";
import type { HeartRateZoneThresholds } from "../src/domain/heart-rate-zones";

const recording: Recording = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "athlete",
  sport: "run",
  startedAt: 100000,
  state: "recording",
  segment: 0,
  autoPause: true,
  simulation: true,
};
const points = (hr?: number): Sample[] =>
  Array.from({ length: 13 }, (_, i) => ({
    lat: 0,
    lng: i * 0.0001,
    t: recording.startedAt + i * 5000,
    accuracy: 4,
    segment: 0,
    ...(hr === undefined ? {} : { hr }),
  }));
const thresholds: HeartRateZoneThresholds = [100, 130, 160, 180];

describe("saved recording heart-rate provenance", () => {
  it("uses save-time settings after recovery and snapshots them without changing measured samples", async () => {
    const db = new MemoryDatabase();
    const engine = new RecordingEngine(db);
    const profile = defaultProfile(recording.ownerId);
    profile.hrZoneThresholds = [100, 120, 140, 170];
    await engine.begin(recording);
    const source = points(150);
    await engine.ingest(source);
    await engine.markSaving();
    // Recovery uses the profile supplied at save, including changes during recording.
    profile.hrZoneThresholds = [...thresholds];
    const recovered = new RecordingEngine(db);
    const activity = await recovered.save(profile, "Measured run", "", 7);
    expect(activity.summary.zones).toEqual([0, 0, 60, 0, 0]);
    expect(activity.summary.load).toBe(3);
    expect(activity.summary.hrZoneMaxHR).toBe(190);
    expect(activity.summary.hrZoneThresholds).toEqual(thresholds);
    profile.hrZoneThresholds[1] = 110;
    expect(activity.summary.hrZoneThresholds).toEqual(thresholds);
    expect(await db.samples(recording.id)).toEqual(source);
    expect(
      (await db.get<typeof activity>(`activity:athlete:${recording.id}`))
        ?.summary,
    ).toEqual(activity.summary);
    const edited = editActivityMetadata(activity, "athlete", 1, {
      title: "Edited run",
      note: "Recovery",
      rpe: 10,
      visibility: "private",
    });
    expect(edited.summary).toEqual(activity.summary);
    expect(await recovered.active()).toBeNull();
  });

  it("rejects undated sensor readings and keeps missing HR on duration-RPE load even with invalid zones", async () => {
    const db = new MemoryDatabase();
    const engine = new RecordingEngine(db);
    await engine.begin(recording);
    const source = points();
    await engine.ingest(source);
    const profile = defaultProfile(recording.ownerId);
    profile.hrZoneThresholds = [100, 100, 160, 180];
    const saved = await engine.save(profile, "No sensor", "", 7, [
      { t: NaN, hr: 150 },
      { t: Infinity, hr: 150 },
      { t: 150000, hr: Infinity },
    ]);
    expect(saved.summary.avgHR).toBeNull();
    expect(saved.summary.zones).toEqual([0, 0, 0, 0, 0]);
    expect(saved.summary.hrZoneThresholds).toBeUndefined();
    expect(saved.summary.loadMethod).toBe("duration-rpe");
    expect(saved.summary.load).toBe(7);
    expect(await db.samples(recording.id)).toEqual(source);
  });

  it("falls back to default boundaries for measured recordings with invalid profile settings", async () => {
    const db = new MemoryDatabase();
    const engine = new RecordingEngine(db);
    await engine.begin(recording);
    await engine.ingest(points(130));
    const profile = defaultProfile(recording.ownerId);
    profile.hrZoneThresholds = [100, 100, 160, 180];
    const saved = await engine.save(profile, "Measured", "", 10);
    expect(saved.summary.zones).toEqual([0, 60, 0, 0, 0]);
    expect(saved.summary.load).toBe(2);
    expect(saved.summary.hrZoneThresholds).toBeUndefined();
  });

  it("keeps failed final commits recoverable and retries to exactly one saved activity", async () => {
    class InterruptedDatabase extends MemoryDatabase {
      fail = true;
      override async commit(
        values: Record<string, unknown>,
        removeKeys: string[] = [],
      ) {
        if (this.fail) {
          this.fail = false;
          throw new Error("save interrupted");
        }
        await super.commit(values, removeKeys);
      }
    }
    const db = new InterruptedDatabase();
    const engine = new RecordingEngine(db);
    await engine.begin(recording);
    await engine.ingest(points(150));
    await engine.markSaving();
    const profile = defaultProfile(recording.ownerId);
    profile.hrZoneThresholds = [...thresholds];
    await expect(engine.save(profile, "Retry", "", 7)).rejects.toThrow(
      "save interrupted",
    );
    expect((await engine.active())?.state).toBe("saving");
    expect(await db.list("activity:")).toHaveLength(0);
    expect(await db.samples(recording.id)).toEqual(points(150));
    const recovered = new RecordingEngine(db);
    const saved = await recovered.save(profile, "Retry", "", 7);
    expect(saved.summary.load).toBe(3);
    expect(await db.list("activity:")).toHaveLength(1);
    expect(await recovered.active()).toBeNull();
  });
});

it("applies current zones at Watch import while preserving source and enforcing athlete ownership", () => {
  const profile = defaultProfile(recording.ownerId);
  profile.hrZoneThresholds = [...thresholds];
  const payload = {
    version: 1,
    id: recording.id,
    ownerId: recording.ownerId,
    sport: recording.sport,
    startedAt: recording.startedAt,
    endedAt: 160000,
    points: points(150),
    laps: [],
  };
  const source = structuredClone(payload);
  const imported = decodeWatchWorkout(payload, profile, 200000);
  expect(imported.activity.summary.zones).toEqual([0, 0, 60, 0, 0]);
  expect(imported.activity.summary.load).toBe(3);
  expect(imported.activity.summary.hrZoneThresholds).toEqual(thresholds);
  expect(imported.activity.visibility).toBe("private");
  expect(imported.points).toEqual(payload.points);
  expect(payload).toEqual(source);
  profile.hrZoneThresholds[0] = 90;
  expect(imported.activity.summary.hrZoneThresholds).toEqual(thresholds);
  expect(() =>
    decodeWatchWorkout(payload, defaultProfile("other"), 200000),
  ).toThrow("another athlete");
});

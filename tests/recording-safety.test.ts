import { describe, it, expect, vi } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { RecordingEngine } from "../src/services/recorder-engine";
import { defaultProfile } from "../src/services/seed";
import { mergeHeartRate } from "../src/services/health-enrichment";
import {
  progression,
  challengeProgress,
  weeklyStats,
  records,
} from "../src/domain/analytics";
import type { Recording, Sample } from "../src/domain/types";
const recording: Recording = {
  id: "r",
  ownerId: "u",
  sport: "run",
  startedAt: 100000,
  state: "recording",
  segment: 0,
  autoPause: true,
  simulation: true,
};
const point = (i: number): Sample => ({
  lat: 0,
  lng: i * 0.0001,
  t: 100000 + i * 5000,
  accuracy: 4,
  segment: 0,
});

describe("recording durability", () => {
  it("serializes a pause against arriving GPS batches", async () => {
    const db = new MemoryDatabase(),
      engine = new RecordingEngine(db);
    await engine.begin(recording);
    await Promise.all([
      engine.ingest([point(0), point(1)]),
      engine.pause(),
      engine.ingest([point(2), point(3)]),
    ]);
    expect(await db.samples("r")).toHaveLength(2);
    expect((await engine.active())?.state).toBe("paused");
    expect((await engine.stats("r")).count).toBe(2);
  });
  it("retries a failed atomic GPS write without double-counting", async () => {
    class FailingDatabase extends MemoryDatabase {
      fail = false;
      override async commitSamples(
        id: string,
        points: Sample[],
        values: Record<string, unknown>,
      ) {
        if (this.fail) {
          this.fail = false;
          throw new Error("disk temporarily unavailable");
        }
        await super.commitSamples(id, points, values);
      }
    }
    const db = new FailingDatabase(),
      engine = new RecordingEngine(db);
    await engine.begin(recording);
    db.fail = true;
    await expect(engine.ingest([point(0), point(1)])).rejects.toThrow("disk");
    expect((await engine.stats("r")).count).toBe(0);
    expect(await db.samples("r")).toHaveLength(0);
    const restarted = new RecordingEngine(db);
    await restarted.ingest([point(0), point(1)]);
    expect((await restarted.stats("r")).count).toBe(2);
    expect((await restarted.stats("r")).distance).toBeCloseTo(11.1195, 2);
  });
  it("breaks the route at a GPS outage and retains the gap after restart", async () => {
    const db = new MemoryDatabase(),
      engine = new RecordingEngine(db);
    await engine.begin(recording);
    await engine.ingest([point(0), point(1), point(10), point(11)]);
    const restarted = new RecordingEngine(db);
    expect((await restarted.active())?.segment).toBe(1);
    const saved = await restarted.save(defaultProfile("u"), "Outage", "", 5);
    expect(saved.summary.distance).toBeCloseTo(22.239, 2);
    expect(saved.summary.moving).toBe(10);
    expect(saved.route.map((p) => p.segment)).toEqual([0, 0, 1, 1]);
  });
  it("rejects stale fixes delivered after a real recording resumes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(200000);
    try {
      const db = new MemoryDatabase(),
        engine = new RecordingEngine(db);
      await engine.begin({ ...recording, simulation: false });
      await engine.ingest([point(0), point(1)]);
      await engine.pause();
      await engine.resume();
      await engine.ingest([
        point(2),
        { ...point(3), t: 201000 },
        { ...point(4), t: 206000 },
      ]);
      expect((await db.samples("r")).map((p) => p.t)).toEqual([
        100000, 105000, 201000, 206000,
      ]);
      expect((await engine.stats("r")).moving).toBe(10);
    } finally {
      now.mockRestore();
    }
  });
  it("never counts a simulated recording toward progression or challenges", async () => {
    const db = new MemoryDatabase(),
      engine = new RecordingEngine(db);
    await engine.begin(recording);
    await engine.ingest(Array.from({ length: 200 }, (_, i) => point(i)));
    const saved = await engine.save(defaultProfile("u"), "Simulation", "", 5);
    expect(saved.simulated).toBe(true);
    expect(progression([saved], saved.endedAt).level).toBe(1);
    expect(weeklyStats([saved], saved.endedAt).distance).toBe(0);
    expect(records([saved])).toEqual([]);
    expect(
      challengeProgress(
        {
          id: "c",
          title: "Miles",
          kind: "distance",
          target: 1000,
          start: 0,
          end: 10000000,
          joined: true,
        },
        [saved],
      ),
    ).toBe(0);
  });
});
it("enriches GPS with nearby valid heart rate without filling sensor gaps", () => {
  const result = mergeHeartRate(
    [point(0), point(1), { ...point(2), hr: 150 }, point(20)],
    [
      { t: 100200, hr: 125 },
      { t: 107000, hr: 130 },
      { t: 120000, hr: 500 },
    ],
  );
  expect(result.map((p) => p.hr)).toEqual([125, 130, 150, undefined]);
});

it("keeps raw samples and the save form when input validation fails", async () => {
  const db = new MemoryDatabase(),
    engine = new RecordingEngine(db);
  await engine.begin(recording);
  await engine.ingest([point(0), point(1)]);
  await engine.markSaving();
  await expect(engine.save(defaultProfile("u"), "Run", "", 11)).rejects.toThrow(
    "Perceived effort",
  );
  await expect(
    engine.save(defaultProfile("u"), "Run", "", 1.5),
  ).rejects.toThrow("whole number");
  expect((await engine.active())?.state).toBe("saving");
  expect(await db.samples("r")).toHaveLength(2);
  expect(await db.list("activity:")).toHaveLength(0);
});
it("cannot save another athlete's recording", async () => {
  const db = new MemoryDatabase(),
    engine = new RecordingEngine(db);
  await engine.begin(recording);
  await engine.ingest([point(0), point(1)]);
  await expect(
    engine.save(defaultProfile("other"), "Run", "", 5),
  ).rejects.toThrow("another athlete");
  expect(await engine.active()).not.toBeNull();
});

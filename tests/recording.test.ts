import { it, expect } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { RecordingEngine } from "../src/services/recorder-engine";
import { defaultProfile } from "../src/services/seed";
it("records, pauses, resumes after process restart, and saves a private activity", async () => {
  const db = new MemoryDatabase(),
    engine = new RecordingEngine(db);
  await engine.begin({
    id: "test",
    ownerId: "u",
    sport: "run",
    startedAt: 100000,
    state: "recording",
    segment: 0,
    autoPause: true,
    simulation: true,
  });
  const sample = (i: number) => ({
    lat: 0,
    lng: i * 0.0001,
    t: 100000 + i * 5000,
    accuracy: 4,
    segment: 0,
  });
  await engine.ingest([sample(0), sample(1)]);
  await engine.pause();
  await engine.ingest([sample(2)]);
  expect(await db.samples("test")).toHaveLength(2);
  const restarted = new RecordingEngine(db);
  await restarted.resume();
  await restarted.ingest([sample(3), sample(4), sample(4)]);
  await restarted.markSaving();
  const a = await restarted.save(defaultProfile("u"), "Morning run", "Good", 4);
  expect(a.summary.moving).toBe(10);
  expect(a.visibility).toBe("private");
  expect(await restarted.active()).toBe(null);
  expect(await db.samples("test")).toHaveLength(4);
  expect(await db.get("activity:u:test")).not.toBe(null);
});

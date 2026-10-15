import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { RecordingEngine } from "../src/services/recorder-engine";
import { CommunityTrackRepository } from "../src/services/community-track-repository";
import { defaultProfile } from "../src/services/default-profile";
import type { Recording, Sample } from "../src/domain/types";
const start = 1700000000000;
const recording: Recording = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "me",
  sport: "run",
  startedAt: start,
  state: "recording",
  segment: 0,
  autoPause: false,
  simulation: false,
};
const points: Sample[] = Array.from({ length: 61 }, (_, i) => ({
  lat: 0,
  lng: i * 0.00018,
  t: start + i * 5000,
  accuracy: 4,
  segment: 0,
}));
afterEach(() => vi.restoreAllMocks());
async function record(db: MemoryDatabase, simulation = false) {
  vi.spyOn(Date, "now").mockReturnValue(start + 305000);
  const engine = new RecordingEngine(db);
  await engine.begin({ ...recording, simulation });
  await engine.ingest(points);
  await engine.markSaving();
  return engine;
}
describe("automatic recording to community mapping", () => {
  it("atomically saves the genuine activity and reference-only contribution", async () => {
    const db = new MemoryDatabase(),
      engine = await record(db);
    const activity = await engine.save(defaultProfile("me"), "Run", "", 5);
    const drafts = await new CommunityTrackRepository(db).list("me");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      activityId: activity.id,
      origin: "device-gps",
      state: "pending",
      sourceRevision: 1,
    });
    expect(JSON.stringify(drafts)).not.toMatch(/"lat"|"lng"|"lines"|"hr"/);
    expect(await db.get("recording:active")).toBeNull();
    expect(await db.samples(activity.id)).toHaveLength(61);
  });
  it("does not collect simulation or recordings made while disabled", async () => {
    for (const simulation of [true, false]) {
      const db = new MemoryDatabase();
      if (!simulation)
        await new CommunityTrackRepository(db).setEnabled("me", false);
      const engine = await record(db, simulation);
      await engine.save(defaultProfile("me"), "Workout", "", 5);
      expect(await new CommunityTrackRepository(db).list("me")).toEqual([]);
    }
  });
  it("keeps recovery intact if the combined save fails, then retries once", async () => {
    class Failing extends MemoryDatabase {
      fail = false;
      override async commit(
        values: Record<string, unknown>,
        remove?: string[],
      ) {
        if (
          this.fail &&
          Object.keys(values).some((k) => k.startsWith("activity:"))
        )
          throw Error("disk");
        return super.commit(values, remove);
      }
    }
    const db = new Failing(),
      engine = await record(db);
    db.fail = true;
    await expect(
      engine.save(defaultProfile("me"), "Run", "", 5),
    ).rejects.toThrow("disk");
    expect(await db.get("recording:active")).not.toBeNull();
    expect(await new CommunityTrackRepository(db).list("me")).toEqual([]);
    db.fail = false;
    await engine.save(defaultProfile("me"), "Run", "", 5);
    expect(await new CommunityTrackRepository(db).list("me")).toHaveLength(1);
  });
});

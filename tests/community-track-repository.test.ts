import { describe, it, expect, vi } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import {
  CommunityTrackRepository,
  type CommunityTrackPort,
} from "../src/services/community-track-repository";
import type { PreparedTrackEvidence } from "../src/domain/community-tracks";
const evidence = (id = "a", revision = 1): PreparedTrackEvidence => ({
  sourceActivityId: id,
  sourceRevision: revision,
  sport: "run",
  origin: "device-gps",
  algorithmVersion: "gps-track-evidence-v1",
  evidenceCategory: "gps_observed_use",
  status: "unverified",
  lines: [
    [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.003 },
    ],
  ],
  acceptedSamples: 6,
  rejectedSamples: 0,
  eligibleForPublication: false,
});
const port = (): CommunityTrackPort => ({
  preference: vi.fn(async () => ({ enabled: true, revision: 1 })),
  setPreference: vi.fn(async (enabled) => ({ enabled, revision: 2 })),
  submit: vi.fn(async () => {}),
  withdraw: vi.fn(async () => {}),
  deleteAll: vi.fn(async () => {}),
});
describe("durable automatic track contributions", () => {
  it("stores references only with the atomic recording commit, retries across instances", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db, () => 100),
      p = port();
    const writes = await r.prepareForCommit("me", evidence());
    await db.commit({ ...writes, "activity:me:a": { id: "a" } });
    expect(JSON.stringify(writes)).not.toContain("lines");
    expect(JSON.stringify(writes)).not.toContain("lat");
    p.submit = vi
      .fn()
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValueOnce(undefined);
    await r.flush("me", p);
    expect((await r.list("me"))[0]).toMatchObject({
      state: "pending",
      attempts: 1,
      retryAt: 30100,
    });
    await new CommunityTrackRepository(db, () => 30101).flush("me", p);
    expect((await r.list("me"))[0]?.state).toBe("submitted");
  });
  it("preserves a remotely disabled choice and never submits queued evidence", async () => {
    const r = new CommunityTrackRepository(new MemoryDatabase()),
      p = port();
    await r.enqueue("me", evidence());
    p.preference = vi.fn(async () => ({ enabled: false, revision: 8 }));
    await r.flush("me", p);
    expect((await r.settings("me")).enabled).toBe(false);
    expect(p.submit).not.toHaveBeenCalled();
  });
  it("does not backfill stale recording commits after disable and reenable", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db),
      p = port(),
      old = await r.prepareForCommit("me", evidence());
    await r.setEnabled("me", false);
    await r.setEnabled("me", true);
    await db.commit(old);
    await r.flush("me", p);
    expect(p.submit).not.toHaveBeenCalled();
    await r.flush("me", p);
    expect(p.withdraw).toHaveBeenCalledWith("a");
  });
  it("serializes duplicate enrollment and keeps a newer revision", async () => {
    const db = new MemoryDatabase(),
      a = new CommunityTrackRepository(db),
      b = new CommunityTrackRepository(db);
    await Promise.all([
      a.enqueue("me", evidence()),
      b.enqueue("me", evidence()),
    ]);
    expect(await a.list("me")).toHaveLength(1);
    await a.enqueue("me", evidence("a", 2));
    await b.enqueue("me", evidence("a", 1));
    expect((await a.list("me"))[0]?.sourceRevision).toBe(2);
    expect(await a.list("other")).toEqual([]);
  });
  it("keeps retraction durable until the server acknowledges it", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db, () => 100),
      p = port();
    await r.enqueue("me", evidence());
    await r.flush("me", p);
    await r.withdraw("me", "a");
    p.withdraw = vi
      .fn()
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValueOnce(undefined);
    await r.flush("me", p);
    expect((await r.list("me"))[0]?.state).toBe("withdraw");
    await new CommunityTrackRepository(db, () => 40000).flush("me", p);
    expect(await r.list("me")).toEqual([]);
  });
  it("holds deletion intent across storage restart and does not disable future contributions", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db),
      p = port();
    await r.enqueue("me", evidence());
    await r.deletePrevious("me");
    await new CommunityTrackRepository(db).flush("me", p);
    expect(p.deleteAll).toHaveBeenCalledTimes(1);
    expect((await r.settings("me")).enabled).toBe(true);
    expect(await r.list("me")).toEqual([]);
    await r.enqueue("me", evidence("b"));
    await r.flush("me", p);
    expect(p.submit).toHaveBeenCalledWith("b", 1, "device-gps", 1);
  });
  it("creates a compensating withdrawal when disabled during submission", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db),
      p = port();
    await r.enqueue("me", evidence());
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => (began = resolve));
    p.submit = async () => {
      began();
      await new Promise<void>((resolve) => (release = resolve));
    };
    const flushing = r.flush("me", p);
    await started;
    await r.setEnabled("me", false);
    release();
    await flushing;
    expect((await r.list("me"))[0]?.state).toBe("withdraw");
    await r.flush("me", p);
    expect(p.withdraw).toHaveBeenCalledWith("a");
  });
  it("does not restore local data after owner cancellation/purge", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db),
      p = port();
    await r.enqueue("me", evidence());
    let active = true;
    p.submit = async () => {
      active = false;
      await r.purge("me");
    };
    await r.flush("me", p, () => active);
    expect(await r.list("me")).toEqual([]);
    expect(await db.get("track-mapping:me")).toBeNull();
  });
});

describe("contribution lifecycle bounds", () => {
  it("prunes only acknowledged recent receipts so collection continues past 200 workouts", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db, () => 1000);
    for (let i = 0; i < 200; i++)
      await db.set("track-contribution:me:" + i, {
        activityId: String(i),
        sourceRevision: 1,
        origin: "device-gps",
        state: "submitted",
        attempts: 0,
        retryAt: 0,
        updatedAt: i,
      });
    expect(await r.enqueue("me", evidence("new"))).toBe(true);
    expect(await r.list("me")).toHaveLength(200);
    expect(await db.get("track-contribution:me:0")).toBeNull();
  });
  it("never drops pending evidence to make space and never backfills edits of unknown source", async () => {
    const db = new MemoryDatabase(),
      r = new CommunityTrackRepository(db);
    for (let i = 0; i < 200; i++)
      await db.set("track-contribution:me:" + i, {
        activityId: String(i),
        sourceRevision: 1,
        origin: "device-gps",
        state: "pending",
        attempts: 0,
        retryAt: 0,
        updatedAt: i,
      });
    expect(await r.enqueue("me", evidence("new"))).toBe(false);
    expect(
      await r.prepareUpdateForCommit("me", evidence("history", 2)),
    ).toEqual({});
    expect(await r.list("me")).toHaveLength(200);
  });
  it("cancels an unacknowledged submission when opt-out occurs even if the response fails", async () => {
    const r = new CommunityTrackRepository(new MemoryDatabase()),
      p = port();
    await r.enqueue("me", evidence());
    p.submit = async () => {
      await r.setEnabled("me", false);
      throw Error("response lost");
    };
    await r.flush("me", p);
    expect((await r.list("me"))[0]?.state).toBe("withdraw");
    await r.flush("me", p);
    expect(p.withdraw).toHaveBeenCalledWith("a");
  });
});
it("refreshes other-device preferences and never submits evidence collected under a stale remote revision", async () => {
  const r = new CommunityTrackRepository(new MemoryDatabase()),
    p = port();
  await r.setEnabled("me", true);
  await r.flush("me", p);
  await r.enqueue("me", evidence("later"));
  p.preference = vi.fn(async () => ({ enabled: true, revision: 3 }));
  await r.flush("me", p);
  expect(p.submit).not.toHaveBeenCalled();
  expect((await r.list("me"))[0]?.state).toBe("withdraw");
  expect((await r.settings("me")).remoteRevision).toBe(3);
});
it("accepts a new local enable epoch awaiting its server acknowledgement", async () => {
  const r = new CommunityTrackRepository(new MemoryDatabase()),
    p = port();
  await r.flush("me", p);
  await r.setEnabled("me", false);
  await r.setEnabled("me", true);
  await r.enqueue("me", evidence("new-local-epoch"));
  await r.flush("me", p);
  expect(p.submit).toHaveBeenCalledWith("new-local-epoch", 1, "device-gps", 2);
});

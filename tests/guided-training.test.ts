import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { TrainingRepository } from "../src/services/training-repository";
import {
  trainingStages,
  trainingPosition,
  validateTrainingPlan,
  type TrainingPlan,
} from "../src/domain/guided-training";
const plan = (id = "plan"): TrainingPlan => ({
  id,
  ownerId: "me",
  title: "My intervals",
  sport: "run",
  warmupSec: 10,
  workSec: 20,
  recoverySec: 5,
  repeats: 2,
  cooldownSec: 10,
  updatedAt: 1000,
});
async function setup() {
  const db = new MemoryDatabase();
  await db.set("session", { userId: "me" });
  let time = 100000;
  return {
    db,
    repo: new TrainingRepository(db, () => time),
    tick: (ms: number) => {
      time += ms;
    },
    now: () => time,
  };
}
describe("Guided training", () => {
  it("builds bounded intervals with recovery only between work repetitions", () => {
    expect(trainingStages(plan()).map((s) => s.seconds)).toEqual([
      10, 20, 5, 20, 10,
    ]);
    expect(
      trainingStages({
        ...plan(),
        warmupSec: 0,
        recoverySec: 0,
        cooldownSec: 0,
      }).map((s) => s.kind),
    ).toEqual(["work", "work"]);
    for (const patch of [
      { workSec: 0 },
      { repeats: 51 },
      { workSec: 1.5 },
      { repeats: 50, workSec: 3600 },
    ])
      expect(() => validateTrainingPlan({ ...plan(), ...patch })).toThrow();
  });
  it("uses wall clock to recover exact current stage after screen absence", async () => {
    const { repo, tick, now } = await setup();
    const session = await repo.start("me", plan(), "s");
    tick(32000);
    expect(trainingPosition(session, now())).toMatchObject({
      index: 2,
      remainingSec: 3,
      elapsedMs: 32000,
    });
    expect(trainingPosition((await repo.active("me"))!, now())).toMatchObject({
      index: 2,
      remainingSec: 3,
    });
  });
  it("persists pause and resume without counting paused wall time or restarting", async () => {
    const { repo, tick, now } = await setup();
    await repo.start("me", plan(), "s");
    tick(13000);
    const paused = await repo.transition("me", "s", "pause");
    tick(60000);
    expect(trainingPosition(paused!, now())).toMatchObject({
      elapsedMs: 13000,
      remainingSec: 17,
    });
    await repo.transition("me", "s", "pause");
    await repo.transition("me", "s", "resume");
    tick(2000);
    expect(trainingPosition((await repo.active("me"))!, now())).toMatchObject({
      elapsedMs: 15000,
      remainingSec: 15,
    });
  });
  it("skips just the current interval and logs skip count without inventing workout activity", async () => {
    const { repo } = await setup();
    await repo.start("me", plan(), "s");
    const session = await repo.transition("me", "s", "skip");
    expect(session).toMatchObject({ elapsedMs: 10000, skipped: 1 });
    await repo.transition("me", "s", "end");
    expect(await repo.active("me")).toBeNull();
    expect((await repo.history("me"))[0]).toMatchObject({
      completed: false,
      elapsedMs: 10000,
      session: { skipped: 1 },
    });
  });
  it("commits completed history and removes active timer atomically; failure is retryable", async () => {
    class Failing extends MemoryDatabase {
      fail = false;
      override async commit(values: Record<string, unknown>, keys?: string[]) {
        if (this.fail) throw new Error("database unavailable");
        return super.commit(values, keys);
      }
    }
    const db = new Failing();
    await db.set("session", { userId: "me" });
    let now = 1000;
    const repo = new TrainingRepository(db, () => now);
    await repo.start("me", plan(), "s");
    now += 65000;
    db.fail = true;
    await expect(repo.transition("me", "s", "complete")).rejects.toThrow(
      "database",
    );
    expect(await repo.active("me")).not.toBeNull();
    expect(await repo.history("me")).toEqual([]);
    db.fail = false;
    await repo.transition("me", "s", "complete");
    expect(await repo.active("me")).toBeNull();
    expect((await repo.history("me"))[0]).toMatchObject({
      completed: true,
      elapsedMs: 65000,
    });
  });
  it("prevents multiple active timers across repository instances", async () => {
    const { db, repo } = await setup();
    const second = new TrainingRepository(db);
    const starts = await Promise.allSettled([
      repo.start("me", plan(), "a"),
      second.start("me", plan(), "b"),
    ]);
    expect(starts.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    await expect(repo.transition("me", "missing", "pause")).rejects.toThrow(
      "changed",
    );
  });
  it("snapshots active plan while later plan edits and deletes remain independent", async () => {
    const { repo } = await setup(),
      original = plan();
    await repo.save(original, null);
    await repo.start("me", original, "s");
    await repo.save({ ...original, workSec: 50, updatedAt: 2000 }, original);
    await expect(repo.remove(original)).rejects.toThrow("changed");
    await repo.remove((await repo.plans("me"))[0]!);
    expect((await repo.active("me"))!.plan.workSec).toBe(20);
  });
  it("handles clock rollback honestly and can pause instead of adding time", async () => {
    const { repo, tick, now } = await setup();
    const session = await repo.start("me", plan(), "s");
    tick(-1000);
    expect(trainingPosition(session, now())).toMatchObject({
      clockRollback: true,
      elapsedMs: 0,
    });
    await expect(repo.transition("me", "s", "skip")).rejects.toThrow("clock");
    expect(await repo.transition("me", "s", "pause")).toMatchObject({
      state: "paused",
      elapsedMs: 0,
    });
  });
  it("guards owner switch and purges only that owner's plans timer and logs", async () => {
    const { db, repo } = await setup();
    await repo.save(plan(), null);
    await repo.start("me", plan(), "s");
    await db.set("session", { userId: "other" });
    await expect(repo.transition("me", "s", "pause")).rejects.toThrow(
      "account changed",
    );
    await repo.save({ ...plan("otherplan"), ownerId: "other" }, null);
    await repo.purge("me");
    expect(await repo.active("me")).toBeNull();
    expect(await repo.plans("me")).toEqual([]);
    expect(await repo.plans("other")).toHaveLength(1);
  });
  it("recovers a malformed saved timer without touching recorded activities", async () => {
    const { db, repo } = await setup();
    await db.set("guided-session:me", { id: "broken", ownerId: "me" });
    await db.set("activity:workout", { id: "workout" });
    await expect(repo.active("me")).rejects.toThrow("cannot be read");
    await repo.clearTimer("me");
    expect(await repo.active("me")).toBeNull();
    expect(await db.get("activity:workout")).toEqual({ id: "workout" });
  });
});

import { describe, it, expect } from "vitest";
import {
  analyseSleep,
  sleepSummary,
  sleepStartVariation,
  validateSleepRead,
  type SleepHistoryRead,
  type SleepInterval,
  type SleepSession,
} from "../src/domain/sleep-analysis";
import { SleepRepository } from "../src/services/sleep-repository";
import { MemoryDatabase } from "../src/storage/port";
const now = Date.now(),
  h = 3600000,
  start = now - 2 * 86400000;
const interval = (
  id: string,
  a: number,
  b: number,
  stage: SleepInterval["stage"],
): SleepInterval => ({
  id,
  start: start + a * h,
  end: start + b * h,
  stage,
  sourceName: "Watch",
});
const read = (intervals: SleepInterval[]): SleepHistoryRead => ({
  provider: "HealthKit",
  readAt: now,
  from: now - 7 * 86400000,
  to: now,
  complete: true,
  intervals,
});
describe("real sleep interval analysis", () => {
  it("unions duplicate source readings and lets actual stages refine generic sleep", () => {
    const sessions = analyseSleep(
      read([
        interval("total", 0, 4, "asleep"),
        interval("core", 0, 2, "core"),
        interval("deep", 2, 3, "deep"),
        interval("duplicate", 2, 3, "deep"),
      ]),
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sleepHours: 4,
      durations: { core: 2, deep: 1, asleep: 1 },
      hasConflict: false,
    });
  });
  it("retains unknown sessions and in-bed data without assuming it was all sleep or awake", () => {
    for (const stage of ["unknown", "in_bed"] as const) {
      const s = analyseSleep(read([interval("x", 0, 8, stage)]))[0]!;
      expect(s.sleepHours).toBeNull();
      expect(s.durations.awake).toBeUndefined();
      expect(s.durations[stage]).toBe(8);
      expect(sleepSummary([s]).averageSleepHours).toBeNull();
    }
  });
  it("keeps conflicting sleep stages unspecified rather than summing both providers", () => {
    const s = analyseSleep(
      read([interval("core", 0, 3, "core"), interval("rem", 2, 4, "rem")]),
    )[0]!;
    expect(s.sleepHours).toBe(3);
    expect(s.durations.unknown).toBe(1);
    expect(s.hasConflict).toBe(true);
  });
  it("does not call disputed awake versus asleep time asleep", () => {
    const s = analyseSleep(
      read([
        interval("sleep", 0, 4, "asleep"),
        interval("wake", 1, 2, "awake"),
      ]),
    )[0]!;
    expect(s.sleepHours).toBe(3);
    expect(s.durations.unknown).toBe(1);
    expect(s.durations.awake).toBeUndefined();
  });
  it("keeps unrecorded gaps as separate sessions and missing days out of the average", () => {
    const sessions = analyseSleep(
      read([
        interval("first", 0, 2, "asleep"),
        interval("second", 3, 5, "deep"),
      ]),
    );
    expect(sessions).toHaveLength(2);
    expect(sleepSummary(sessions).averageSleepHours).toBe(2);
    expect(sessions.flatMap((s) => s.slices)).toHaveLength(2);
  });
  it("marks partial range-boundary sessions and excludes them from descriptive averages", () => {
    const r = read([interval("x", 0, 8, "asleep")]);
    r.from = start + 2 * h;
    const s = analyseSleep(r)[0]!;
    expect(s.sleepHours).toBe(6);
    expect(s.partial).toBe(true);
    expect(sleepSummary([s]).averageSleepHours).toBeNull();
  });
  it("handles midnight in start variation and requires three real starts", () => {
    const fixture = (hour: number, minute: number): SleepSession => ({
      id: String(hour),
      start: new Date(2026, 9, 10, hour, minute).getTime(),
      end: now,
      sleepHours: 1,
      durations: { asleep: 1 },
      slices: [],
      sourceNames: ["Watch"],
      hasConflict: false,
      partial: false,
    });
    expect(
      sleepStartVariation([fixture(23, 50), fixture(0, 10), fixture(0, 0)]),
    ).toBe(20);
    expect(sleepStartVariation([fixture(23, 50)])).toBeNull();
  });
  it("rejects invalid bounds, repeated conflicting identities and capped incomplete reads", () => {
    for (const r of [
      { ...read([]), complete: false },
      {
        ...read([]),
        intervals: Array(5001).fill(interval("a", 0, 1, "asleep")),
      },
      { ...read([]), to: NaN },
      read([
        interval("same", 0, 1, "asleep"),
        interval("same", 0, 2, "asleep"),
      ]),
      read([{ ...interval("a", 0, 1, "asleep"), end: NaN }]),
    ])
      expect(() =>
        validateSleepRead(r as unknown as SleepHistoryRead),
      ).toThrow();
  });
});
describe("owner-bound sleep cache", () => {
  const setup = async () => {
    const db = new MemoryDatabase();
    await db.set("session", { userId: "me" });
    await db.set("health:me", { source: "HealthKit" });
    return { db, repo: new SleepRepository(db, () => now) };
  };
  it("replaces a complete window, preserves saved history after malformed/incomplete reads, and isolates owners", async () => {
    const { repo } = await setup(),
      original = read([interval("a", 0, 2, "asleep")]);
    expect(await repo.replace("me", original)).toBe(true);
    await expect(
      repo.replace("me", {
        ...original,
        complete: false,
      } as unknown as SleepHistoryRead),
    ).rejects.toThrow();
    expect(await repo.read("me")).toEqual(original);
    expect(await repo.read("other")).toBeNull();
  });
  it("blocks writes after disconnect, owner switch or cleanup has begun", async () => {
    const { db, repo } = await setup();
    await db.set("account:cleanup", { userId: "me" });
    expect(await repo.replace("me", read([]))).toBe(false);
    await db.remove("account:cleanup");
    await db.remove("health:me");
    expect(await repo.replace("me", read([]))).toBe(false);
    await db.set("health:me", {});
    await db.set("session", { userId: "other" });
    expect(await repo.replace("me", read([]))).toBe(false);
    expect(await repo.read("me")).toBeNull();
  });
  it("rejects old refresh races and copies inputs before queuing", async () => {
    const { repo } = await setup(),
      r = read([interval("a", 0, 2, "asleep")]),
      saved = repo.replace("me", r);
    r.intervals[0]!.stage = "awake";
    await saved;
    expect((await repo.read("me"))?.intervals[0]?.stage).toBe("asleep");
    expect(
      await repo.replace("me", {
        ...read([]),
        readAt: now - 1000,
        to: now - 1000,
      }),
    ).toBe(false);
    await repo.purge("me");
    expect(await repo.read("me")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { WellnessRepository } from "../src/services/wellness-repository";
import {
  formatWellnessLocalTime,
  parseWellnessLocalTime,
  wellnessValue,
  type WellnessEntry,
} from "../src/domain/wellness";
import { purgeAccountData } from "../src/services/account-data";
const now = new Date(2026, 9, 14, 12).getTime();
const entry = (
  id: string,
  patch: Partial<WellnessEntry> = {},
): WellnessEntry => ({
  id,
  ownerId: "me",
  kind: "water",
  value: 250,
  at: now,
  note: "",
  ...patch,
});
describe("manual health journal persistence", () => {
  it("preserves data across instances, adds water and treats steps as a daily total", async () => {
    const db = new MemoryDatabase(),
      repo = new WellnessRepository(db, () => now);
    await repo.save(entry("a"), null);
    await repo.save(entry("b"), null);
    await repo.save(
      entry("steps-a", { kind: "steps", value: 2000, at: now - 1000 }),
      null,
    );
    await repo.save(entry("steps-b", { kind: "steps", value: 2500 }), null);
    const records = await new WellnessRepository(db, () => now).list("me");
    expect(wellnessValue(records, "water", now)).toBe(500);
    expect(wellnessValue(records, "steps", now)).toBe(2500);
    expect(await repo.list("other")).toEqual([]);
  });
  it("rejects conflicting edits and stale deletes while preserving the current record", async () => {
    const db = new MemoryDatabase(),
      a = new WellnessRepository(db, () => now),
      b = new WellnessRepository(db, () => now);
    const original = entry("a");
    await a.save(original, null);
    await a.save({ ...original, value: 400 }, original);
    await expect(b.save({ ...original, value: 300 }, original)).rejects.toThrow(
      "changed",
    );
    await expect(b.remove("me", "a", original)).rejects.toThrow("changed");
    expect((await a.list("me"))[0]?.value).toBe(400);
    await expect(a.save(original, null)).rejects.toThrow("changed");
  });
  it("does not store later mutations to a queued input object", async () => {
    const db = new MemoryDatabase(),
      repo = new WellnessRepository(db, () => now);
    const record = entry("a"),
      pending = repo.save(record, null);
    record.value = Infinity;
    await pending;
    expect((await repo.list("me"))[0]?.value).toBe(250);
  });
  it("serializes simultaneous timer starts across repository instances", async () => {
    const db = new MemoryDatabase(),
      a = new WellnessRepository(db, () => now),
      b = new WellnessRepository(db, () => now);
    const outcomes = await Promise.allSettled([
      a.startFast("me"),
      b.startFast("me"),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await b.activeFast("me")).toBe(now);
  });
  it("keeps a running timer recoverable after a failed atomic finish", async () => {
    class FailingDatabase extends MemoryDatabase {
      fail = false;
      override async commit(...args: Parameters<MemoryDatabase["commit"]>) {
        if (this.fail) throw new Error("storage unavailable");
        return super.commit(...args);
      }
    }
    const db = new FailingDatabase();
    let clock = now;
    const repo = new WellnessRepository(db, () => clock);
    await repo.startFast("me");
    clock += 3600000;
    db.fail = true;
    await expect(repo.finishFast("me", "fast")).rejects.toThrow("storage");
    expect(await repo.activeFast("me")).toBe(now);
    expect(await repo.list("me")).toEqual([]);
    db.fail = false;
    await repo.finishFast("me", "fast");
    expect((await repo.list("me"))[0]).toMatchObject({
      kind: "fasting",
      value: 1,
      startedAt: now,
    });
    expect(await repo.activeFast("me")).toBeNull();
  });
  it("handles clock rollback and cancellation without inventing duration", async () => {
    const db = new MemoryDatabase();
    let clock = now;
    const repo = new WellnessRepository(db, () => clock);
    await repo.startFast("me");
    clock -= 60000;
    await expect(repo.finishFast("me", "fast")).rejects.toThrow("clock");
    expect(await repo.activeFast("me")).toBe(now);
    await repo.cancelFast("me");
    expect(await repo.activeFast("me")).toBeNull();
  });
  it("rejects impossible dates and preserves local calendar timestamps", () => {
    expect(parseWellnessLocalTime(formatWellnessLocalTime(now), now)).toBe(now);
    for (const text of [
      "2026-02-30 12:00",
      "2025-02-29 12:00",
      "2026-10-14 25:00",
      "2026-10-15 12:00",
      "14/10/2026",
    ])
      expect(() => parseWellnessLocalTime(text, now)).toThrow();
  });
  it("removes one owner's journal and timer on account deletion", async () => {
    const db = new MemoryDatabase(),
      repo = new WellnessRepository(db, () => now);
    await repo.save(entry("a"), null);
    await repo.save(entry("b", { ownerId: "other" }), null);
    await repo.startFast("me");
    await repo.startFast("other");
    await purgeAccountData(db, {
      userId: "me",
      email: "me@example.test",
      demo: false,
      local: true,
    });
    expect(await repo.list("me")).toEqual([]);
    expect(await repo.activeFast("me")).toBeNull();
    expect(await repo.list("other")).toHaveLength(1);
    expect(await repo.activeFast("other")).toBe(now);
  });
});

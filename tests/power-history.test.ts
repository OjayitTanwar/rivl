import { describe, expect, it, vi } from "vitest";
vi.mock("../src/storage/database", () => ({ database: {} }));
vi.mock("../src/services/remote", () => ({ downloadTrack: vi.fn() }));
import { MemoryDatabase } from "../src/storage/port";
import { historicalPower } from "../src/services/power-history";
import type { Activity, Sample } from "../src/domain/types";
const activity = (
  id: string,
  startedAt: number,
  patch: Partial<Activity> = {},
): Activity =>
  ({
    id,
    ownerId: "me",
    sport: "ride",
    startedAt,
    endedAt: startedAt + 60000,
    revision: 1,
    summary: { avgPower: null },
    ...patch,
  }) as Activity;
const samples = (a: Activity, watts = 250): Sample[] =>
  Array.from({ length: 31 }, (_, i) => ({
    t: a.startedAt + i * 1000,
    watts,
    segment: 0,
    lat: 0,
    lng: 0,
    accuracy: 1,
  }));
async function setup() {
  const db = new MemoryDatabase();
  await db.set("session", { userId: "me" });
  return db;
}
describe("Historical raw power comparison", () => {
  it("compares only earlier genuine owned cycling raw samples even when summary power is missing", async () => {
    const db = await setup(),
      old = activity("old", 100000),
      current = activity("current", 200000),
      foreign = activity("foreign", 90000, { ownerId: "other" }),
      demo = activity("demo", 80000, { demo: true }),
      future = activity("future", 300000),
      run = activity("run", 70000, { sport: "run" });
    const read = vi.fn(async (a: Activity) => samples(a));
    const result = await historicalPower(
      [old, current, foreign, demo, future, run],
      "me",
      "ride",
      0,
      "current",
      { db, download: read },
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(old);
    expect(result).toMatchObject({
      count: 1,
      curve: [
        { seconds: 5, watts: 250 },
        { seconds: 30, watts: 250 },
      ],
    });
  });
  it("uses a new policy-and-revision cache and retains measured zero", async () => {
    const db = await setup(),
      old = activity("old", 100000),
      current = activity("current", 200000);
    await db.set("power-curve:me:old:1", [{ seconds: 5, watts: 999 }]);
    const read = vi.fn(async (a: Activity) => samples(a, 0));
    const first = await historicalPower(
      [old, current],
      "me",
      "ride",
      0,
      "current",
      { db, download: read },
    );
    expect(first.curve[0]?.watts).toBe(0);
    await historicalPower([old, current], "me", "ride", 0, "current", {
      db,
      download: read,
    });
    expect(read).toHaveBeenCalledTimes(1);
    await historicalPower(
      [{ ...old, revision: 2 }, current],
      "me",
      "ride",
      0,
      "current",
      { db, download: read },
    );
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("recomputes malformed cached values rather than displaying them", async () => {
    const db = await setup(),
      old = activity("old", 100000),
      current = activity("current", 200000);
    await db.set("power-curve:me:raw-v1:old:1", [
      { seconds: 5, watts: Infinity },
    ]);
    const read = vi.fn(async (a: Activity) => samples(a));
    expect(
      (
        await historicalPower([old, current], "me", "ride", 0, "current", {
          db,
          download: read,
        })
      ).curve[0]?.watts,
    ).toBe(250);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("cancels before late cache writes when the screen disappears", async () => {
    const db = await setup(),
      old = activity("old", 100000),
      current = activity("current", 200000),
      controller = new AbortController();
    const download = async (a: Activity) => {
      controller.abort();
      return samples(a);
    };
    await expect(
      historicalPower([old, current], "me", "ride", 0, "current", {
        db,
        download,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
    expect(await db.list("power-curve:me:raw-v1:")).toEqual([]);
  });
  it("blocks cache writes after account cleanup or an owner switch during read", async () => {
    for (const cleanup of [true, false]) {
      const db = await setup(),
        old = activity("old", 100000),
        current = activity("current", 200000);
      const download = async (a: Activity) => {
        await db.set(cleanup ? "account:cleanup" : "session", {
          userId: cleanup ? "me" : "other",
        });
        return samples(a);
      };
      await expect(
        historicalPower([old, current], "me", "ride", 0, "current", {
          db,
          download,
        }),
      ).rejects.toThrow("account changed");
      expect(await db.list("power-curve:me:raw-v1:")).toEqual([]);
    }
  });
  it("bounds historical work to the latest 50 eligible activities and discloses the limit", async () => {
    const db = await setup(),
      past = Array.from({ length: 51 }, (_, i) =>
        activity(`past${i}`, 100000 + i * 100000),
      ),
      current = activity("current", 6000000),
      download = vi.fn(async (a: Activity) => samples(a));
    const result = await historicalPower(
      [...past, current],
      "me",
      "ride",
      0,
      "current",
      { db, download },
    );
    expect(download).toHaveBeenCalledTimes(50);
    expect(result.limited).toBe(true);
    expect(result.count).toBe(50);
  });
  it("settles cancellation while an underlying track reader is stalled", async () => {
    const db = await setup(),
      old = activity("old", 100000),
      current = activity("current", 200000),
      controller = new AbortController();
    const waiting = historicalPower(
      [old, current],
      "me",
      "ride",
      0,
      "current",
      {
        db,
        signal: controller.signal,
        download: async () => {
          controller.abort();
          return new Promise<Sample[]>(() => {});
        },
      },
    );
    await expect(waiting).rejects.toThrow("cancelled");
    expect(await db.list("power-curve:me:raw-v1:")).toEqual([]);
  });
  it("enforces one 30-second deadline across multiple slow reads instead of renewing it", async () => {
    vi.useFakeTimers();
    try {
      const db = await setup(),
        current = activity("current", 500000),
        past = [
          activity("a", 100000),
          activity("b", 200000),
          activity("c", 300000),
        ];
      const download = vi.fn(
        async (a: Activity) =>
          new Promise<Sample[]>((resolve) =>
            setTimeout(() => resolve(samples(a)), 14000),
          ),
      );
      const waiting = historicalPower(
        [...past, current],
        "me",
        "ride",
        0,
        "current",
        { db, download },
      );
      const assertion = expect(waiting).rejects.toThrow("took too long");
      await vi.advanceTimersByTimeAsync(30001);
      await assertion;
      expect(download).toHaveBeenCalledTimes(3);
      expect(await db.list("power-curve:me:raw-v1:")).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(15000);
      expect(await db.list("power-curve:me:raw-v1:")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

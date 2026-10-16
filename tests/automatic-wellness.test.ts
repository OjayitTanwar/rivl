import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { refreshAutomaticWellness } from "../src/services/automatic-wellness";
import { WellnessRepository } from "../src/services/wellness-repository";
import { wellnessValue } from "../src/domain/wellness";
import type { HealthSnapshot } from "../src/services/health-types";

const now = new Date(2026, 9, 14, 12).getTime();
const day = new Date(2026, 9, 14).getTime();
function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    source: "HealthKit",
    readAt: now,
    restingHR: null,
    hrv: null,
    baselineHRV: null,
    sampleDays: 0,
    sleepHours: 8,
    sleepStartedAt: now - 86400000,
    sleepEndedAt: now,
    steps: 1234,
    stepsStartedAt: day,
    waterComplete: true,
    water: [{ id: "native:water", at: now - 1000, ml: 250 }],
    ...overrides,
  };
}
async function connected() {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const db = new MemoryDatabase();
  await db.set("session", { userId: "a" });
  await db.set("health:a", snapshot());
  return { db, repository: new WellnessRepository(db) };
}
afterEach(() => vi.restoreAllMocks());
describe("automatic wellness", () => {
  it("imports native HRV samples with stable IDs and explicit methods, rejecting invalid samples", async () => {
    const { db, repository } = await connected();
    const value = snapshot({
      hrvReadings: [
        { id: "hrv:one", at: now - 1000, value: 45, method: "SDNN" },
        { id: "bad", at: now - 1000, value: -10, method: "SDNN" },
      ],
    });
    await refreshAutomaticWellness(db, "a", value);
    await refreshAutomaticWellness(db, "a", value);
    const records = (await repository.list("a")).filter(
      (e) => e.kind === "hrv",
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      value: 45,
      hrvMethod: "SDNN",
      source: { provider: "HealthKit", recordId: "hrv:one" },
    });
    expect(await repository.list("other")).toEqual([]);
  });

  it("replaces daily totals and native water IDs instead of double counting refreshes", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(db, "a", snapshot());
    await refreshAutomaticWellness(db, "a", snapshot({ steps: 2000 }));
    const records = await repository.list("a");
    expect(records).toHaveLength(3);
    expect(wellnessValue(records, "steps", now)).toBe(2000);
    expect(wellnessValue(records, "water", now)).toBe(250);
    expect(records.find((e) => e.kind === "sleep")?.source?.windowStart).toBe(
      now - 86400000,
    );
  });
  it("preserves manual records but uses connected water instead of adding duplicate intake", async () => {
    const { db, repository } = await connected();
    await repository.save({
      id: "manual",
      ownerId: "a",
      kind: "water",
      value: 250,
      at: now,
      note: "",
    });
    await refreshAutomaticWellness(db, "a", snapshot());
    const records = await repository.list("a");
    expect(records).toHaveLength(4);
    expect(wellnessValue(records, "water", now)).toBe(250);
  });
  it("reconciles removed or corrected native water only after a complete read", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(db, "a", snapshot());
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({ water: [], waterComplete: false }),
    );
    expect(wellnessValue(await repository.list("a"), "water", now)).toBe(250);
    await refreshAutomaticWellness(db, "a", snapshot({ water: [] }));
    expect(wellnessValue(await repository.list("a"), "water", now)).toBe(0);
  });
  it("does not import partial hydration, invalid readings, future samples or unknown weight", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        steps: NaN,
        sleepHours: -1,
        weightKg: 65,
        waterComplete: false,
      }),
    );
    expect(await repository.list("a")).toEqual([]);
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        steps: null,
        sleepHours: null,
        water: [{ id: "future", at: now + 1, ml: 250 }],
      }),
    );
    expect(await repository.list("a")).toEqual([]);
  });
  it("cannot import into another owner, a disconnected account or a cancelled UI owner", async () => {
    const { db, repository } = await connected();
    expect(await refreshAutomaticWellness(db, "b", snapshot())).toBe(0);
    expect(
      await refreshAutomaticWellness(db, "a", snapshot(), () => false),
    ).toBe(0);
    await db.remove("health:a");
    expect(await refreshAutomaticWellness(db, "a", snapshot())).toBe(0);
    expect(await repository.list("a")).toEqual([]);
  });
  it("ignores older responses and duplicate native identifiers", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(db, "a", snapshot({ steps: 2000 }));
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({ readAt: now - 1, steps: 1000, water: [] }),
    );
    expect(wellnessValue(await repository.list("a"), "steps", now)).toBe(2000);
    expect(wellnessValue(await repository.list("a"), "water", now)).toBe(250);
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({ water: [snapshot().water![0]!, snapshot().water![0]!] }),
    );
    expect(wellnessValue(await repository.list("a"), "water", now)).toBe(250);
  });
  it("queues a purge after pending imports so no health records survive signout", async () => {
    const { db, repository } = await connected();
    const write = refreshAutomaticWellness(db, "a", snapshot());
    const purge = repository.purge("a");
    await Promise.all([write, purge]);
    expect(await repository.list("a")).toEqual([]);
  });
  it("keeps previous hydration when complete responses contain malformed or conflicting samples", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(db, "a", snapshot());
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({ water: [{ id: "bad", at: now - 1, ml: NaN }] }),
    );
    expect(wellnessValue(await repository.list("a"), "water", now)).toBe(250);
    const original = snapshot().water![0]!;
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({ water: [original, { ...original, ml: 500 }] }),
    );
    expect(wellnessValue(await repository.list("a"), "water", now)).toBe(250);
    expect(
      await refreshAutomaticWellness(
        db,
        "a",
        snapshot({ source: "unknown" as HealthSnapshot["source"] }),
      ),
    ).toBe(0);
  });
});

describe("connected daily movement totals", () => {
  it("retains fractional floors and kcal in one canonical owner/day record", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        floorsClimbed: 4.5,
        activeEnergyKcal: 350.25,
        movementStartedAt: day,
      }),
    );
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        floorsClimbed: 5.75,
        activeEnergyKcal: 410.5,
        movementStartedAt: day,
      }),
    );
    const records = await repository.list("a");
    expect(records.filter((r) => r.kind === "floorsClimbed")).toHaveLength(1);
    expect(wellnessValue(records, "floorsClimbed", now)).toBe(5.75);
    expect(wellnessValue(records, "activeEnergy", now)).toBe(410.5);
    expect(
      records.find((r) => r.kind === "activeEnergy")?.source?.windowStart,
    ).toBe(day);
    expect(wellnessValue(records, "activeEnergy", now + 86400000)).toBeNull();
  });
  it("preserves earlier actual readings on missing, malformed or incomplete-window data", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        floorsClimbed: 7,
        activeEnergyKcal: 200,
        movementStartedAt: day,
      }),
    );
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        floorsClimbed: NaN,
        activeEnergyKcal: null,
        movementStartedAt: day,
      }),
    );
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        floorsClimbed: 90,
        activeEnergyKcal: 900,
        movementStartedAt: day + 1000,
      }),
    );
    const records = await repository.list("a");
    expect(wellnessValue(records, "floorsClimbed", now)).toBe(7);
    expect(wellnessValue(records, "activeEnergy", now)).toBe(200);
  });
  it("stores an actual reported zero while keeping absent metrics unknown", async () => {
    const { db, repository } = await connected();
    await refreshAutomaticWellness(
      db,
      "a",
      snapshot({
        floorsClimbed: 0,
        activeEnergyKcal: null,
        movementStartedAt: day,
      }),
    );
    const entries = await repository.list("a");
    expect(wellnessValue(entries, "floorsClimbed", now)).toBe(0);
    expect(wellnessValue(entries, "activeEnergy", now)).toBeNull();
  });
});

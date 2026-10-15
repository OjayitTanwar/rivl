import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { GearRepository } from "../src/services/gear-repository";
import { gearStats, type Gear } from "../src/domain/gear";
import type { Activity } from "../src/domain/types";
const gear = (id = "shoe", patch: Partial<Gear> = {}): Gear => ({
  id,
  ownerId: "one",
  name: "Daily shoes",
  type: "shoes",
  initialMeters: 2000,
  addedAt: 1000,
  retired: false,
  isDefault: true,
  ...patch,
});
const activity = (id = "run", patch: Partial<Activity> = {}): Activity =>
  ({
    id,
    ownerId: "one",
    sport: "run",
    summary: { distance: 5000 },
    ...patch,
  }) as Activity;
describe("Gear tracking", () => {
  it("keeps one default when saves overlap", async () => {
    const repo = new GearRepository(new MemoryDatabase());
    await Promise.all([
      repo.save(gear("a")),
      repo.save(gear("b")),
      repo.save(gear("c")),
    ]);
    expect(
      (await repo.list("one")).filter((g) => g.isDefault).map((g) => g.id),
    ).toEqual(["c"]);
  });
  it("counts each real compatible activity once, with an initial distance", () => {
    const a = activity(),
      fake = activity("sim", { simulated: true }),
      wrong = activity("bike", { sport: "ride" }),
      foreign = activity("other", { ownerId: "two" });
    const assignments = [a, fake, wrong, foreign].map((a) => ({
      ownerId: "one",
      activityId: a.id,
      gearId: "shoe",
    }));
    expect(
      gearStats(gear(), assignments, [a, a, fake, wrong, foreign]),
    ).toEqual({ meters: 7000, activities: 1 });
  });
  it("switches defaults atomically and never assigns foreign or retired gear", async () => {
    const repo = new GearRepository(new MemoryDatabase());
    await repo.save(gear());
    await repo.save(gear("new"));
    expect(
      (await repo.list("one")).filter((g) => g.isDefault).map((g) => g.id),
    ).toEqual(["new"]);
    await expect(
      repo.assign(activity("foreign", { ownerId: "two" }), "new"),
    ).rejects.toThrow();
    await repo.assignDefault(activity());
    await repo.save(gear("new", { retired: true }));
    await expect(repo.assign(activity("run-2"), "new")).rejects.toThrow();
    expect(await repo.assignments("one")).toHaveLength(1);
    expect(
      (await repo.list("one")).find((g) => g.id === "new")?.isDefault,
    ).toBe(false);
  });
  it("allows correction without double mileage and skips simulated defaults", async () => {
    const repo = new GearRepository(new MemoryDatabase());
    await repo.save(gear());
    await repo.assignDefault(activity());
    await repo.assignDefault(activity());
    await repo.assignDefault(activity("sim", { simulated: true }));
    expect(await repo.assignments("one")).toHaveLength(1);
    await repo.assign(activity(), null);
    expect(await repo.assignments("one")).toEqual([]);
  });
});

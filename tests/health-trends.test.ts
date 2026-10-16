import { describe, it, expect } from "vitest";
import { healthTrend, healthRecordValue } from "../src/domain/health-trends";
import {
  validateWellnessEntry,
  type WellnessEntry,
} from "../src/domain/wellness";
import { WellnessRepository } from "../src/services/wellness-repository";
import { MemoryDatabase } from "../src/storage/port";
const now = new Date(2026, 9, 16, 12).getTime();
const entry = (patch: Partial<WellnessEntry> = {}): WellnessEntry => ({
  id: "one",
  ownerId: "me",
  kind: "hrv",
  value: 50,
  at: now,
  note: "",
  hrvMethod: "SDNN",
  ...patch,
});
describe("health journal and HRV trends", () => {
  it("requires seven prior calendar days and keeps HRV methods separate", () => {
    const samples = Array.from({ length: 8 }, (_, i) =>
      entry({ id: String(i), at: now - i * 86400000 }),
    );
    expect(healthTrend(samples, now).status).toBe("ready");
    expect(healthTrend(samples, now).change).toBe(0);
    expect(
      healthTrend(
        samples.map((s, i) => (i ? { ...s, hrvMethod: "RMSSD" } : s)),
        now,
      ).status,
    ).toBe("building");
    expect(healthTrend(samples.slice(1), now + 2 * 86400000).status).toBe(
      "stale",
    );
  });
  it("does not weight a heavily sampled day more strongly", () => {
    const prior = Array.from({ length: 7 }, (_, i) =>
      entry({
        id: String(i),
        at: now - (i + 1) * 86400000,
        value: i ? 50 : 100,
      }),
    );
    const trend = healthTrend(
      [
        entry(),
        ...prior,
        ...Array.from({ length: 20 }, (_, i) => ({
          ...prior[0]!,
          id: `extra${i}`,
        })),
      ],
      now,
    );
    expect(trend.baseline).toBeCloseTo(400 / 7);
  });
  it("validates paired pressures, explicit medication units and cycle flow", () => {
    expect(() =>
      validateWellnessEntry(
        entry({ kind: "bloodPressure", value: 120, diastolic: 130 }),
        now,
      ),
    ).toThrow("diastolic");
    expect(() =>
      validateWellnessEntry(entry({ kind: "medication", value: 1 }), now),
    ).toThrow("medication");
    expect(() =>
      validateWellnessEntry(entry({ kind: "cycle", value: 5 }), now),
    ).toThrow();
    expect(
      healthRecordValue(
        entry({ kind: "bloodPressure", value: 120, diastolic: 80 }),
      ),
    ).toBe("120/80 mmHg");
  });
  it("persists, edits and deletes additional logs with owner isolation", async () => {
    const db = new MemoryDatabase(),
      repo = new WellnessRepository(db, () => now);
    const original = entry({
      kind: "medication",
      value: 1,
      medicationName: "Example",
      doseUnit: "tablet",
      hrvMethod: undefined,
    });
    await repo.save(original, null);
    expect(await repo.list("other")).toEqual([]);
    const changed = { ...original, value: 2 };
    await repo.save(changed, original);
    expect((await repo.list("me"))[0]?.value).toBe(2);
    await expect(repo.remove("me", original.id, original)).rejects.toThrow(
      "changed",
    );
    await repo.remove("me", changed.id, changed);
    expect(await repo.list("me")).toEqual([]);
  });
});

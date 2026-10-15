import { it, expect } from "vitest";
import { editActivityMetadata } from "../src/domain/activity-edit";
import type { Activity } from "../src/domain/types";
import { processActivity } from "../src/domain/processing";
const a: Activity = {
  id: "one",
  ownerId: "owner",
  title: "Ride",
  note: "",
  sport: "ride",
  startedAt: 1,
  endedAt: 120001,
  summary: { ...processActivity([], "ride", 1, 120001), moving: 120, load: 10 },
  route: [],
  visibility: "private",
  rpe: 5,
  sync: "local",
  revision: 1,
  photos: ["private-photo"],
};
const patch = {
  title: "Evening ride",
  note: "Easy spin",
  rpe: 3,
  visibility: "private" as const,
};
it("updates metadata and RPE load while preserving the recorded activity", () => {
  const result = editActivityMetadata(a, "owner", 1, patch);
  expect(result.revision).toBe(2);
  expect(result.summary.load).toBe(6);
  expect(result.route).toEqual(a.route);
  expect(result.photos).toEqual(a.photos);
  expect(result.startedAt).toBe(a.startedAt);
  expect(a.title).toBe("Ride");
  expect(a.summary.load).toBe(10);
});
it("retains sensor-derived load and rejects stale or foreign edits", () => {
  expect(
    editActivityMetadata(
      { ...a, summary: { ...a.summary, loadMethod: "hr-zones" } },
      "owner",
      1,
      patch,
    ).summary.load,
  ).toBe(10);
  expect(() => editActivityMetadata(a, "other", 1, patch)).toThrow();
  expect(() => editActivityMetadata(a, "owner", 2, patch)).toThrow("changed");
});
it("rejects invalid titles, privacy and fractional effort", () => {
  for (const changes of [
    { title: "" },
    { rpe: 3.5 },
    { rpe: 0 },
    { visibility: "unknown" },
  ])
    expect(() =>
      editActivityMetadata(a, "owner", 1, {
        ...patch,
        ...changes,
      } as typeof patch),
    ).toThrow();
});

import { it, expect, vi } from "vitest";
vi.mock("../src/storage/database", async () => {
  const { MemoryDatabase } = await import("../src/storage/port");
  return { database: new MemoryDatabase() };
});
import { database } from "../src/storage/database";
import {
  autoRecordPreferences,
  saveAutoRecordPreferences,
  onAutoRecordChange,
} from "../src/services/auto-record-preferences";
it("requires an explicit valid opt-in and fails closed on corrupted preferences", async () => {
  expect((await autoRecordPreferences("new-owner")).enabled).toBe(false);
  await database.set("auto-record:corrupt", { enabled: "yes", sport: "ride" });
  expect((await autoRecordPreferences("corrupt")).enabled).toBe(false);
  await database.set("auto-record:invalid-sport", {
    enabled: true,
    sport: "driving",
  });
  expect((await autoRecordPreferences("invalid-sport")).enabled).toBe(false);
});
it("keeps detection choices owner-scoped and notifies after saving", async () => {
  let calls = 0;
  const remove = onAutoRecordChange(() => calls++);
  await saveAutoRecordPreferences("runner", { enabled: true, sport: "run" });
  expect(calls).toBe(1);
  expect(await autoRecordPreferences("runner")).toEqual({
    enabled: true,
    sport: "run",
  });
  expect((await autoRecordPreferences("other")).enabled).toBe(false);
  remove();
  await saveAutoRecordPreferences("runner", { enabled: false, sport: "run" });
  expect(calls).toBe(1);
});

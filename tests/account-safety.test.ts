import { describe, expect, it, vi } from "vitest";
import {
  processDeletion,
  recentlyAuthenticated,
  type DeletionPort,
} from "../supabase/functions/_shared/deletion";
import { purgeAccountData } from "../src/services/account-data";
import { MemoryDatabase } from "../src/storage/port";
function port(): DeletionPort {
  return {
    claim: vi
      .fn()
      .mockResolvedValue({ owner_id: "athlete", lease_token: "lease" }),
    leaseValid: vi.fn().mockResolvedValue(true),
    media: vi.fn().mockResolvedValue([]),
    removeMedia: vi.fn(),
    deleteIdentity: vi.fn(),
    finish: vi.fn(),
  };
}
describe("durable account deletion", () => {
  it("removes all media before the identity", async () => {
    const p = port(),
      order: string[] = [];
    vi.mocked(p.media)
      .mockResolvedValueOnce(["athlete/run/photo.jpg"])
      .mockResolvedValueOnce([]);
    vi.mocked(p.removeMedia).mockImplementation(async () => {
      order.push("media");
    });
    vi.mocked(p.deleteIdentity).mockImplementation(async () => {
      order.push("identity");
    });
    expect(await processDeletion(p)).toBe("completed");
    expect(order).toEqual(["media", "identity"]);
    expect(p.finish).toHaveBeenCalledWith(
      { owner_id: "athlete", lease_token: "lease" },
      true,
    );
  });
  it("keeps the identity on storage failure and makes the job retryable", async () => {
    const p = port();
    vi.mocked(p.media).mockResolvedValue(["athlete/run/photo.jpg"]);
    vi.mocked(p.removeMedia).mockRejectedValue(new Error("storage down"));
    expect(await processDeletion(p)).toBe("retry");
    expect(p.deleteIdentity).not.toHaveBeenCalled();
    expect(p.finish).toHaveBeenCalledWith(expect.anything(), false);
  });
  it("will not destroy an identity after losing its lease", async () => {
    const p = port();
    vi.mocked(p.leaseValid)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(await processDeletion(p)).toBe("retry");
    expect(p.deleteIdentity).not.toHaveBeenCalled();
  });
  it("rejects another athlete's object path", async () => {
    const p = port();
    vi.mocked(p.media).mockResolvedValue(["someone-else/photo.jpg"]);
    expect(await processDeletion(p)).toBe("retry");
    expect(p.removeMedia).not.toHaveBeenCalled();
    expect(p.deleteIdentity).not.toHaveBeenCalled();
  });
  it("does not process a job that another worker owns", async () => {
    const p = port();
    vi.mocked(p.claim).mockResolvedValue(null);
    expect(await processDeletion(p)).toBe("idle");
    expect(p.deleteIdentity).not.toHaveBeenCalled();
  });
  it("requires recent actual authentication, not token refresh or a future timestamp", () => {
    const now = 10000000;
    expect(
      recentlyAuthenticated(
        { amr: [{ method: "password", timestamp: now / 1000 - 10 }] },
        now,
      ),
    ).toBe(true);
    expect(
      recentlyAuthenticated(
        { amr: [{ method: "password", timestamp: now / 1000 - 301 }] },
        now,
      ),
    ).toBe(false);
    expect(
      recentlyAuthenticated(
        { amr: [{ method: "token_refresh", timestamp: now / 1000 }] },
        now,
      ),
    ).toBe(false);
    expect(
      recentlyAuthenticated(
        { amr: [{ method: "password", timestamp: now / 1000 + 100 }] },
        now,
      ),
    ).toBe(false);
  });
});
it("clears only the deleted athlete's local data and raw tracks", async () => {
  const db = new MemoryDatabase();
  const session = {
    userId: "a",
    email: "A@example.test",
    demo: false,
    local: true,
  };
  await db.set("session", session);
  await db.set("activity:a:1", { id: "1", ownerId: "a" });
  await db.set("activity:b:2", { id: "2", ownerId: "b" });
  await db.set("profile:a", { name: "Private" });
  await db.set("profile:b", { name: "Keep" });
  await db.set("outbox:a:1", {});
  await db.set("local-auth:a@example.test", {});
  await db.set("health:a", {});
  await db.set("recording:stats:1", {});
  await db.set("recording:active", { id: "3", ownerId: "a" });
  await db.appendSamples("1", [
    { lat: 1, lng: 2, t: 1, accuracy: 1, segment: 0 },
  ]);
  await db.appendSamples("2", [
    { lat: 3, lng: 4, t: 2, accuracy: 1, segment: 0 },
  ]);
  await db.set("route-draft:a:new", { name: "Private route" });
  await db.set("route-outbox:a:1", { owner: "a" });
  await db.set("route-draft:b:new", { name: "Keep route" });
  await db.set("auto-record:a", { enabled: true });
  await db.set("auto-record:b", { enabled: true });
  await db.set("gear:a:shoe", { ownerId: "a" });
  await db.set("gear-activity:a:1", { gearId: "shoe" });
  await db.set("gear:b:shoe", { ownerId: "b" });
  await purgeAccountData(db, session);
  await purgeAccountData(db, session);
  expect(await db.get("auto-record:a")).toBeNull();
  expect(await db.get("auto-record:b")).not.toBeNull();
  expect(await db.list("gear:a:")).toEqual([]);
  expect(await db.list("gear-activity:a:")).toEqual([]);
  expect(await db.get("gear:b:shoe")).not.toBeNull();
  expect(await db.get("route-draft:a:new")).toBeNull();
  expect(await db.get("route-outbox:a:1")).toBeNull();
  expect(await db.get("route-draft:b:new")).not.toBeNull();
  expect(await db.list("activity:a:")).toEqual([]);
  expect(await db.samples("1")).toEqual([]);
  expect(await db.samples("2")).toHaveLength(1);
  expect(await db.get("profile:b")).toEqual({ name: "Keep" });
  for (const key of [
    "session",
    "recording:active",
    "outbox:a:1",
    "local-auth:a@example.test",
    "profile:a",
    "health:a",
    "recording:stats:1",
  ])
    expect(await db.get(key)).toBeNull();
});

import { beforeEach, expect, it, vi } from "vitest";
import type { RoutePlan } from "../src/domain/types";

const state = vi.hoisted(() => ({
  owner: "owner-a",
  routes: [] as Record<string, unknown>[],
  pageError: false,
  switchOnWrite: false,
  switchOnRead: false,
  routeReads: 0,
  writes: 0,
  feed: [] as Record<string, unknown>[],
  efforts: [] as Record<string, unknown>[],
  limits: [] as unknown[][],
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "token" }));
vi.mock("../src/storage/database", async () => {
  const { MemoryDatabase } = await import("../src/storage/port");
  return { database: new MemoryDatabase() };
});
vi.mock("../src/services/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: { user: { id: state.owner }, access_token: "test-token" },
        },
        error: null,
      })),
    },
    rpc: vi.fn(() => ({
      setHeader: () => Promise.resolve({ data: [], error: null }),
    })),
    from: vi.fn((table: string) => {
      let after = "";
      let write = false;
      const query = {
        select: () => query,
        setHeader: () => query,
        eq: () => query,
        gte: () => query,
        order: () => query,
        in: () => query,
        limit: (count: number, options?: unknown) => {
          state.limits.push([table, count, options]);
          return query;
        },
        gt: (_key: string, value: string) => {
          after = value;
          return query;
        },
        upsert: () => {
          write = true;
          return query;
        },
        delete: () => {
          write = true;
          return query;
        },
        then: (resolve: (result: unknown) => unknown) => {
          if (write) {
            state.writes++;
            if (state.switchOnWrite) state.owner = "owner-b";
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          if (table === "routes") {
            state.routeReads++;
            if (state.switchOnRead) state.owner = "owner-b";
            if (after && state.pageError)
              return Promise.resolve({
                data: null,
                error: new Error("page failed"),
              }).then(resolve);
            return Promise.resolve({
              data: state.routes
                .filter((row) => String(row.id) > after)
                .slice(0, 500),
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({
            data:
              table === "published_activities"
                ? state.feed
                : table === "segment_efforts"
                  ? state.efforts
                  : [],
            error: null,
          }).then(resolve);
        },
      };
      return query;
    }),
  },
}));
import { database } from "../src/storage/database";
import { routeRepository } from "../src/services/routes";
import { refreshCommunity } from "../src/services/community";
const session = {
  userId: "owner-a",
  local: false,
  demo: false,
  email: "athlete@example.com",
};
const route = (id: string): RoutePlan => ({
  id,
  name: "Route",
  sport: "run",
  points: [],
  distance: 20,
  ascent: 0,
  surface: "Path",
  saved: true,
});
beforeEach(async () => {
  await database.removePrefix("");
  Object.assign(state, {
    owner: "owner-a",
    routes: [],
    pageError: false,
    switchOnWrite: false,
    switchOnRead: false,
    routeReads: 0,
    writes: 0,
    feed: [],
    efforts: [],
    limits: [],
  });
});
it("does not acknowledge a delete under another authenticated owner", async () => {
  await routeRepository.delete("owner-a", "route-id", false);
  state.owner = "owner-b";
  await expect(routeRepository.sync("owner-a")).rejects.toThrow(
    "account changed",
  );
  expect(state.writes).toBe(0);
  expect(await database.get("route-outbox:owner-a:route-id")).not.toBeNull();
});
it("retains an outbox entry when the account changes during a successful request", async () => {
  await routeRepository.delete("owner-a", "route-id", false);
  state.switchOnWrite = true;
  await expect(routeRepository.sync("owner-a")).rejects.toThrow(
    "account changed",
  );
  expect(state.writes).toBe(1);
  expect(await database.get("route-outbox:owner-a:route-id")).not.toBeNull();
});
it("loads all route pages before removing missing cache entries", async () => {
  state.routes = Array.from({ length: 1201 }, (_, i) => ({
    ...route(String(i).padStart(5, "0")),
    owner_id: "owner-a",
  }));
  await database.set("route:owner-a:01200", route("01200"));
  await database.set("route:owner-a:removed", route("removed"));
  await refreshCommunity(session);
  expect(state.routeReads).toBe(3);
  expect(await database.list("route:owner-a:")).toHaveLength(1201);
  expect(await database.get("route:owner-a:01200")).not.toBeNull();
  expect(await database.get("route:owner-a:removed")).toBeNull();
});
it("preserves all caches on a later-page network failure", async () => {
  state.routes = Array.from({ length: 501 }, (_, i) => ({
    ...route(String(i).padStart(5, "0")),
    owner_id: "owner-a",
  }));
  state.pageError = true;
  await database.set("route:owner-a:kept", route("kept"));
  await database.set("post:owner-a:kept", { id: "kept" });
  await expect(refreshCommunity(session)).rejects.toThrow("page failed");
  expect(await database.list("route:owner-a:")).toEqual([route("kept")]);
  expect(await database.get("post:owner-a:kept")).not.toBeNull();
});
it("does not replace caches if the authenticated owner changes during refresh", async () => {
  await database.set("post:owner-a:kept", { id: "kept" });
  state.switchOnRead = true;
  await expect(refreshCommunity(session)).rejects.toThrow("account changed");
  expect(await database.get("post:owner-a:kept")).not.toBeNull();
});

it("keeps exact feed totals while bounding the comment preview and own cheer payload", async () => {
  state.feed = [
    {
      id: "post-id",
      owner_id: "owner-b",
      profiles: { name: "Athlete", handle: "athlete" },
      title: "Run",
      sport: "run",
      started_at: "2026-10-14T08:00:00Z",
      summary: { elapsed: 60 },
      note: "",
      route: [],
      visibility: "public",
      reaction_total: [{ count: 30000 }],
      comment_total: [{ count: 9000 }],
      reactions: [{ athlete_id: "owner-a" }],
      comments: [],
    },
  ];
  await refreshCommunity(session);
  expect(await database.get("post:owner-a:post-id")).toMatchObject({
    reactionCount: 30000,
    commentCount: 9000,
    reactions: ["owner-a"],
  });
  expect(state.limits).toContainEqual([
    "published_activities",
    20,
    { referencedTable: "comments" },
  ]);
  expect(state.limits).toContainEqual([
    "published_activities",
    1,
    { referencedTable: "reactions" },
  ]);
});
it("does not crash or cache rankings whose profile is hidden by RLS", async () => {
  state.efforts = [{ id: "hidden", athlete_id: "owner-b", profiles: null }];
  await refreshCommunity(session);
  expect(await database.list("effort:owner-a:")).toEqual([]);
});

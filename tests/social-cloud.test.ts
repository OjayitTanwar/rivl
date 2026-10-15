import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  owner: "90000000-0000-4000-8000-000000000001",
  calls: [] as {
    table: string;
    action: string;
    filters: unknown[][];
    headers: unknown[][];
    limit?: number;
  }[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  switchDuringQuery: false,
}));
vi.mock("../src/services/routes", () => ({
  cloudAccessToken: async (owner: string) => {
    if (state.owner !== owner) throw new Error("account changed");
    return "owner-token";
  },
  assertCurrentCloudUser: async (owner: string) => {
    if (state.owner !== owner) throw new Error("account changed");
  },
}));
vi.mock("../src/services/safety", () => ({ blockedAthletes: async () => [] }));
vi.mock("../src/storage/database", () => ({ database: {} }));
vi.mock("../src/services/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const call = {
        table,
        action: "select",
        filters: [] as unknown[][],
        headers: [] as unknown[][],
        limit: undefined as number | undefined,
      };
      state.calls.push(call);
      const query = {
        select: () => query,
        neq: (key: string, value: unknown) => {
          call.filters.push(["neq", key, value]);
          return query;
        },
        eq: (key: string, value: unknown) => {
          call.filters.push(["eq", key, value]);
          return query;
        },
        in: (key: string, value: unknown) => {
          call.filters.push(["in", key, value]);
          return query;
        },
        ilike: () => query,
        order: () => query,
        limit: (value: number) => {
          call.limit = value;
          return query;
        },
        setHeader: (key: string, value: string) => {
          call.headers.push([key, value]);
          return query;
        },
        insert: () => {
          call.action = "insert";
          return query;
        },
        update: () => {
          call.action = "update";
          return query;
        },
        delete: () => {
          call.action = "delete";
          return query;
        },
        or: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          if (state.switchDuringQuery) state.owner = "different-account";
          const data = (state.rows[table] ?? [])
            .filter((row) =>
              call.filters.every(([kind, key, value]) =>
                kind === "eq"
                  ? row[key as string] === value
                  : kind === "neq"
                    ? row[key as string] !== value
                    : (value as unknown[]).includes(row[key as string]),
              ),
            )
            .slice(0, call.limit);
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));
import { clubs, follow, joinClub, people } from "../src/services/social";
const owner = "90000000-0000-4000-8000-000000000001";
const other = "90000000-0000-4000-8000-000000000002";
const session = {
  userId: owner,
  local: false,
  demo: false,
  email: "owner@example.test",
};
beforeEach(() => {
  state.owner = owner;
  state.calls = [];
  state.rows = {};
  state.switchDuringQuery = false;
});
it("queries only relationships for the displayed athletes and pins every request to its owner", async () => {
  state.rows.profiles = [{ id: other, name: "Athlete", handle: "athlete" }];
  state.rows.friendships = [
    { requester_id: other, recipient_id: owner, status: "pending" },
  ];
  expect(await people(session)).toMatchObject([
    { id: other, friendship: "received" },
  ]);
  expect(state.calls.filter((c) => c.table === "friendships")).toHaveLength(2);
  expect(
    state.calls.every(
      (c) =>
        c.limit === 30 && c.headers.some((h) => h[1] === "Bearer owner-token"),
    ),
  ).toBe(true);
});
it("marks mutual pending requests as received so the athlete can accept", async () => {
  state.rows.profiles = [{ id: other, name: "Athlete", handle: "athlete" }];
  state.rows.friendships = [
    { requester_id: owner, recipient_id: other, status: "pending" },
    { requester_id: other, recipient_id: owner, status: "pending" },
  ];
  expect(await people(session)).toMatchObject([{ friendship: "received" }]);
});
it("does not return results after a mid-request account change", async () => {
  state.switchDuringQuery = true;
  await expect(people(session)).rejects.toThrow("account changed");
});
it("rejects stale-session writes before any request", async () => {
  state.owner = "different-account";
  await expect(
    follow(session, {
      id: other,
      name: "Athlete",
      handle: "athlete",
      following: false,
    }),
  ).rejects.toThrow("account changed");
  await expect(
    joinClub(session, {
      id: other,
      name: "Club",
      description: "",
      joined: false,
    }),
  ).rejects.toThrow("account changed");
  expect(state.calls).toHaveLength(0);
});
it("pins writes and rejects interpolated non-UUID athlete identifiers", async () => {
  await follow(session, {
    id: other,
    name: "Athlete",
    handle: "athlete",
    following: false,
  });
  expect(state.calls[0]!.headers).toContainEqual([
    "Authorization",
    "Bearer owner-token",
  ]);
  await expect(
    follow(session, {
      id: "bad,recipient_id.eq.any",
      name: "",
      handle: "",
      following: true,
    }),
  ).rejects.toThrow("invalid");
});
it("reads bounded clubs and memberships restricted to those clubs", async () => {
  state.rows.clubs = [{ id: other, name: "Club", description: "" }];
  state.rows.club_members = [{ club_id: other, athlete_id: owner }];
  expect(await clubs(session)).toMatchObject([{ id: other, joined: true }]);
  expect(state.calls.every((c) => c.limit === 100)).toBe(true);
  expect(state.calls[1]!.filters).toContainEqual(["in", "club_id", [other]]);
});

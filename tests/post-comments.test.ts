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
        or: (value: string) => {
          call.headers.push(["cursor", value]);
          return query;
        },
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
import { olderPostComments } from "../src/services/post-comments";
const owner = "90000000-0000-4000-8000-000000000001";
const postId = "90000000-0000-4000-8000-000000000002";
const commentId = "90000000-0000-4000-8000-000000000003";
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
it("retains server microsecond cursor precision, binds post/owner and limits each page", async () => {
  const at = "2026-10-14T09:00:00.123456+00:00";
  state.rows.comments = [
    {
      id: commentId,
      activity_id: postId,
      created_at: at,
      athlete_id: owner,
      profiles: { name: "Athlete" },
      body: "Hello",
    },
  ];
  const result = await olderPostComments(session, postId, {
    id: commentId,
    createdAt: at,
  });
  expect(result.cursor).toEqual({ id: commentId, createdAt: at });
  expect(result.comments[0]).toMatchObject({ createdAt: at });
  expect(state.calls[0]!.limit).toBe(20);
  expect(state.calls[0]!.headers).toContainEqual([
    "Authorization",
    "Bearer owner-token",
  ]);
  expect(state.calls[0]!.headers).toContainEqual([
    "cursor",
    `created_at.lt.${at},and(created_at.eq.${at},id.lt.${commentId})`,
  ]);
});
it("rejects unsafe pagination syntax before sending a request", async () => {
  await expect(
    olderPostComments(session, postId, {
      id: commentId,
      createdAt: "2026-10-14T09:00:00Z,body.neq.none",
    }),
  ).rejects.toThrow("invalid");
  expect(state.calls).toHaveLength(0);
});
it("discards an older page on account change", async () => {
  state.switchDuringQuery = true;
  await expect(
    olderPostComments(session, postId, {
      id: commentId,
      createdAt: "2026-10-14T09:00:00Z",
    }),
  ).rejects.toThrow("account changed");
});

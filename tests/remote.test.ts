import { it, expect, vi, beforeEach } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { processActivity } from "../src/domain/processing";
import type { Activity } from "../src/domain/types";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  storage: { from: vi.fn() },
}));
vi.mock("../src/services/supabase", () => ({ supabase: mock }));
vi.mock("../src/services/media", () => ({ photoBytes: vi.fn() }));
vi.mock("../src/storage/database", () => ({ database: new MemoryDatabase() }));
import { remote } from "../src/services/remote";
const a: Activity = {
  id: "a",
  ownerId: "u",
  title: "Run",
  sport: "run",
  startedAt: 0,
  endedAt: 5000,
  summary: processActivity([], "run", 0, 5000),
  route: [],
  visibility: "private",
  note: "",
  rpe: 5,
  sync: "pending",
  revision: 2,
  photos: [],
};
beforeEach(() => vi.resetAllMocks());
it("sends metadata edits without replacing a track that only exists in the cloud", async () => {
  mock.rpc.mockResolvedValue({ error: null });
  await remote.upload(a, []);
  expect(mock.rpc).toHaveBeenCalledWith(
    "save_activity",
    expect.objectContaining({ p_raw: null, p_points: null }),
  );
});
it("refuses to upload a simulated effort even if the caller bypasses the outbox", async () => {
  await expect(remote.upload({ ...a, simulated: true }, [])).rejects.toThrow(
    "Simulated",
  );
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("pulls every page with a server-clock cursor and a stable timestamp/id boundary", async () => {
  const updatedAt = "2026-10-07T10:00:00.000Z",
    until = "2026-10-08T10:00:00.000Z";
  const rows = Array.from({ length: 1203 }, (_, i) => ({
    id: String(i).padStart(6, "0"),
    owner_id: "u",
    title: "Run",
    sport: "run",
    started_at: updatedAt,
    ended_at: updatedAt,
    updated_at: updatedAt,
    summary: a.summary,
    display_route: [],
    visibility: "private",
    note: "",
    rpe: 5,
    revision: 1,
  }));
  mock.rpc.mockResolvedValue({ data: until, error: null });
  const boundaries: string[] = [];
  mock.from.mockImplementation(() => {
    let after = "",
      limit = 500;
    const q = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      lte: () => q,
      order: () => q,
      limit: (n: number) => {
        limit = n;
        return q;
      },
      or: (filter: string) => {
        boundaries.push(filter);
        after = /id.gt.([^)]*)/.exec(filter)?.[1] ?? "";
        return q;
      },
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({
          data: rows.filter((row) => row.id > after).slice(0, limit),
          error: null,
        }).then(resolve),
    };
    return q;
  });
  const result = await remote.pull("u", 0);
  expect(Array.isArray(result)).toBe(false);
  if (Array.isArray(result)) throw new Error("Expected server cursor");
  expect(result.activities).toHaveLength(1203);
  expect(new Set(result.activities.map((a) => a.id)).size).toBe(1203);
  expect(result.cursor).toBe(Date.parse(until));
  expect(boundaries).toHaveLength(2);
  expect(boundaries[0]).toContain("id.gt.000499");
});

function repeatPage(rows: unknown[]) {
  mock.rpc.mockResolvedValue({ data: "2026-10-08T10:00:00.000Z", error: null });
  mock.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      lte: () => q,
      order: () => q,
      limit: () => q,
      or: () => q,
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return q;
  });
}
function validRow(id = "a") {
  return {
    id,
    owner_id: "u",
    title: "Run",
    sport: "run",
    started_at: "2026-10-07T10:00:00.000Z",
    ended_at: "2026-10-07T10:00:00.000Z",
    updated_at: "2026-10-07T10:00:00.000Z",
    summary: a.summary,
    display_route: [],
    visibility: "private",
    note: "",
    rpe: 5,
    revision: 1,
  };
}
it("rejects a repeated full page instead of looping or returning a new cursor", async () => {
  repeatPage(
    Array.from({ length: 500 }, (_, i) => validRow(String(i).padStart(6, "0"))),
  );
  await expect(remote.pull("u", 0)).rejects.toThrow("boundary");
  expect(mock.from).toHaveBeenCalledTimes(2);
});
it("rejects foreign-owner rows before requesting media", async () => {
  repeatPage([
    { ...validRow(), owner_id: "foreign", photo_keys: ["foreign/a/photo.jpg"] },
  ]);
  await expect(remote.pull("u", 0)).rejects.toThrow();
  expect(mock.storage.from).not.toHaveBeenCalled();
});
it("rejects malformed metadata without returning an advancing sync cursor", async () => {
  repeatPage([{ ...validRow(), summary: {} }]);
  await expect(remote.pull("u", 0)).rejects.toThrow();
});
it("rejects rows beyond the snapshot clock", async () => {
  repeatPage([{ ...validRow(), updated_at: "2026-10-08T10:00:00.000001Z" }]);
  await expect(remote.pull("u", 0)).rejects.toThrow("boundary");
});
it("rejects an invalid clock before requesting activities", async () => {
  mock.rpc.mockResolvedValue({ data: "not-a-date", error: null });
  await expect(remote.pull("u", 0)).rejects.toThrow();
  expect(mock.from).not.toHaveBeenCalled();
});

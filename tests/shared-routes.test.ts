import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  token: vi.fn(),
  current: vi.fn(),
  signals: [] as AbortSignal[],
  headers: [] as unknown[],
}));
vi.mock("../src/services/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => ({
      setHeader: (...header: unknown[]) => {
        mock.headers.push(header);
        return {
          abortSignal: (signal: AbortSignal) => {
            mock.signals.push(signal);
            return mock.rpc(...args);
          },
        };
      },
    }),
  },
}));
vi.mock("../src/services/routes", () => ({
  cloudAccessToken: mock.token,
  assertCurrentCloudUser: mock.current,
}));
import {
  decodeSharedRoute,
  sharedRouteCopy,
} from "../src/domain/shared-routes";
import {
  listSharedRoutes,
  publishSharedRoute,
  unpublishSharedRoute,
  reportSharedRoute,
} from "../src/services/shared-routes";
const owner = "11000000-0000-0000-0000-000000000001",
  id = "22000000-0000-0000-0000-000000000001";
const raw = () => ({
  id,
  owner_id: owner,
  title: "River trail",
  creator: "Actual creator",
  sport: "run",
  points: [
    { lat: 1, lng: 2, t: 123, heartRate: 170 },
    { lat: 1.01, lng: 2.01 },
  ],
  distance: 1500,
  surface: "Trail",
  license: "CC-BY-4.0",
  published_at: "2026-10-16T00:00:00Z",
});
beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  mock.token.mockReset().mockResolvedValue("token");
  mock.current.mockReset().mockResolvedValue(undefined);
  mock.signals.length = 0;
  mock.headers.length = 0;
});
afterEach(() => vi.useRealTimers());
describe("shared route bounded coordinate projection", () => {
  it("strips source telemetry, copies geometry and retains creator/license/source attribution", () => {
    const decoded = decodeSharedRoute(raw()),
      copy = sharedRouteCopy(decoded, "local-copy");
    expect(decoded.points[0]).toEqual({ lat: 1, lng: 2 });
    expect(copy).toMatchObject({
      id: "local-copy",
      routing: "recorded",
      ascent: 0,
      saved: true,
    });
    expect(copy.surface).toContain(id);
    expect(copy.surface).toContain("CC BY 4.0");
    expect(copy.surface).toContain("Actual creator");
    copy.points[0]!.lat = 50;
    expect(decoded.points[0]!.lat).toBe(1);
  });
  it("rejects malformed, unlicensed and unbounded responses", () => {
    for (const patch of [
      { owner_id: "forged" },
      { id: "x" },
      { license: "private" },
      { points: [] },
      {
        points: [
          { lat: NaN, lng: 1 },
          { lat: 1, lng: 2 },
        ],
      },
      { distance: Infinity },
      { distance: 99 },
      { published_at: "bad" },
      { sport: "car" },
      { points: Array.from({ length: 12001 }, () => ({ lat: 1, lng: 2 })) },
    ])
      expect(() => decodeSharedRoute({ ...raw(), ...patch })).toThrow();
  });
});
describe("shared route authenticated adapter", () => {
  it("passes a stable timestamp/id cursor and sport filter without forged owner arguments", async () => {
    mock.rpc.mockResolvedValue({ data: [raw()], error: null });
    const cursor = decodeSharedRoute(raw());
    expect(await listSharedRoutes(owner, "hike", cursor)).toHaveLength(1);
    expect(mock.rpc).toHaveBeenCalledWith("list_shared_routes", {
      p_sport: "hike",
      p_before: cursor.publishedAt,
      p_before_id: cursor.id,
    });
    expect(mock.headers).toEqual([["Authorization", "Bearer token"]]);
    expect(mock.current).toHaveBeenCalledWith(owner);
  });
  it("mutations send only server-authorized route identifiers", async () => {
    await publishSharedRoute(owner, id);
    await unpublishSharedRoute(owner, id);
    await reportSharedRoute(owner, id, "unsafe");
    expect(mock.rpc.mock.calls).toEqual([
      ["publish_shared_route", { p_id: id }],
      ["unpublish_shared_route", { p_id: id }],
      ["report_shared_route", { p_id: id, p_reason: "unsafe" }],
    ]);
  });
  it("refuses stale account responses and oversized pages", async () => {
    mock.current.mockRejectedValueOnce(new Error("account changed"));
    await expect(listSharedRoutes(owner)).rejects.toThrow("account changed");
    mock.rpc.mockResolvedValue({
      data: Array.from({ length: 21 }, raw),
      error: null,
    });
    await expect(listSharedRoutes(owner)).rejects.toThrow(
      "Invalid shared route response",
    );
  });
  it("keeps backend error details private", async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "secret table policy" },
    });
    await expect(publishSharedRoute(owner, id)).rejects.toMatchObject({
      message: "This route is unavailable.",
    });
  });
  it("settles and aborts an unresponsive RPC", async () => {
    vi.useFakeTimers();
    mock.rpc.mockImplementation(() => new Promise(() => {}));
    const request = listSharedRoutes(owner);
    const check = expect(request).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(15000);
    await check;
    expect(mock.signals[0]!.aborted).toBe(true);
  });
});

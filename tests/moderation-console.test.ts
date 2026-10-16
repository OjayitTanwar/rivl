import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  token: vi.fn(),
  current: vi.fn(),
  signals: [] as AbortSignal[],
}));
vi.mock("../src/services/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => ({
      setHeader: () => ({
        abortSignal: (s: AbortSignal) => {
          mock.signals.push(s);
          return mock.rpc(...args);
        },
      }),
    }),
  },
}));
vi.mock("../src/services/routes", () => ({
  cloudAccessToken: mock.token,
  assertCurrentCloudUser: mock.current,
}));
import {
  decodeModerationQueue,
  moderationRoles,
  moderationQueue,
  decideModeration,
  reportCreatorProgram,
} from "../src/services/moderation-console";
const owner = "c9100000-0000-0000-0000-000000000003";
const item = () => ({
  id: "c9300000-0000-0000-0000-000000000001",
  kind: "content" as const,
  targetId: "c9200000-0000-0000-0000-000000000001",
  targetOwner: owner,
  title: "Reported activity",
  excerpt: "Published note",
  reason: "spam",
  createdAt: "2026-10-16T00:00:00Z",
  version: "a".repeat(32),
});
beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  mock.token.mockReset().mockResolvedValue("access");
  mock.current.mockReset().mockResolvedValue(undefined);
  mock.signals.length = 0;
});
afterEach(() => vi.useRealTimers());
describe("moderation adapter", () => {
  it("keeps GPS review and general operator membership separate", async () => {
    mock.rpc.mockResolvedValue({
      data: { moderator: false, trackReviewer: true },
      error: null,
    });
    expect(await moderationRoles(owner)).toEqual({
      moderator: false,
      trackReviewer: true,
    });
    mock.rpc.mockResolvedValue({
      data: { moderator: true, trackReviewer: false },
      error: null,
    });
    expect(await moderationRoles(owner)).toEqual({
      moderator: true,
      trackReviewer: false,
    });
    mock.rpc.mockResolvedValue({
      data: { moderator: "yes", trackReviewer: false },
      error: null,
    });
    await expect(moderationRoles(owner)).rejects.toThrow("could not be read");
  });
  it("accepts bounded projections and drops unexpected raw fields", () => {
    const decoded = decodeModerationQueue([
      { ...item(), rawGps: [{ lat: 1, lng: 2 }], reporterId: "secret" },
    ]);
    expect(decoded).toEqual([item()]);
    expect(
      decodeModerationQueue([{ ...item(), excerpt: "😀".repeat(500) }]),
    ).toHaveLength(1);
    for (const data of [
      null,
      Array.from({ length: 21 }, item),
      [item(), item()],
      [{ ...item(), version: "stale" }],
      [{ ...item(), kind: "privateActivity" }],
      [{ ...item(), excerpt: "x".repeat(501) }],
    ])
      expect(() => decodeModerationQueue(data)).toThrow();
  });
  it("sends server versions and a reason without forged staff identity", async () => {
    await decideModeration(owner, item(), "hide", "  Confirmed spam  ");
    expect(mock.rpc).toHaveBeenCalledWith("decide_moderation", {
      p_kind: "content",
      p_id: item().id,
      p_version: item().version,
      p_decision: "hide",
      p_reason: "Confirmed spam",
    });
    await expect(
      decideModeration(owner, item(), "dismiss", " "),
    ).rejects.toThrow("Enter a review reason");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("cannot leak a queue response after an account switch", async () => {
    mock.rpc.mockResolvedValue({ data: [item()], error: null });
    mock.current.mockRejectedValueOnce(new Error("account changed"));
    await expect(moderationQueue(owner)).rejects.toThrow("account changed");
  });
  it("maps permission and conflict failures without server internals", async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "private SQL" },
    });
    await expect(moderationQueue(owner)).rejects.toMatchObject({
      kind: "auth",
      message: "This account does not have review access.",
    });
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "40001", message: "private SQL" },
    });
    await expect(
      decideModeration(owner, item(), "dismiss", "Reviewed"),
    ).rejects.toMatchObject({
      message: "This review changed. Reload before deciding.",
    });
  });
  it("reports a creator using the caller account token and server-owned target", async () => {
    await reportCreatorProgram(owner, item().targetId, "unsafe");
    expect(mock.rpc).toHaveBeenCalledWith("report_creator_program", {
      p_id: item().targetId,
      p_reason: "unsafe",
    });
  });
  it("aborts and settles stalled requests", async () => {
    vi.useFakeTimers();
    mock.rpc.mockImplementation(() => new Promise(() => {}));
    const pending = moderationQueue(owner),
      check = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(15000);
    await check;
    expect(mock.signals[0]?.aborted).toBe(true);
  });
});

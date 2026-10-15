import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  configured: true,
  signals: [] as AbortSignal[],
}));
vi.mock("../src/services/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      const response = mock.rpc(...args);
      return {
        abortSignal: (signal: AbortSignal) => {
          mock.signals.push(signal);
          return response;
        },
      };
    },
  },
}));
vi.mock("../src/services/config", () => ({
  get backendConfigured() {
    return mock.configured;
  },
}));
import {
  listCreatorPrograms,
  publishCreatorProgram,
  unpublishCreatorProgram,
  decodePublishedCreatorPrograms,
} from "../src/services/creator-training-cloud";
import type { CreatorProgram } from "../src/domain/creator-training";
const owner = "e1000000-0000-0000-0000-000000000001",
  id = "e2000000-0000-0000-0000-000000000001";
const program = (): CreatorProgram => ({
  id,
  ownerId: owner,
  creatorName: "Actual declared creator",
  title: "Intervals",
  description: "",
  sport: "run",
  level: "all",
  weeks: 1,
  revision: 1,
  updatedAt: 1000,
  license: "CC-BY-4.0",
  sessions: [
    {
      id: "session-1",
      week: 1,
      day: 1,
      title: "Session",
      notes: "",
      workout: {
        warmupSec: 60,
        workSec: 60,
        recoverySec: 60,
        repeats: 2,
        cooldownSec: 60,
      },
    },
  ],
});
beforeEach(() => {
  mock.configured = true;
  mock.signals.length = 0;
  mock.rpc.mockReset();
  mock.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.useRealTimers());
describe("creator cloud publication adapter", () => {
  it("aborts and settles stalled RPC work within its deadline without changing a local draft", async () => {
    vi.useFakeTimers();
    mock.rpc.mockImplementationOnce(() => new Promise(() => {}));
    const draft = program(),
      pending = publishCreatorProgram(draft),
      check = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(15000);
    await check;
    expect(mock.signals[0]?.aborted).toBe(true);
    expect(draft.revision).toBe(1);
  });

  it("publishes a bounded explicit snapshot without mutating the original draft", async () => {
    const source = program();
    await publishCreatorProgram(source);
    expect(mock.rpc).toHaveBeenCalledWith("publish_creator_program", {
      p_program: source,
    });
    const payload = mock.rpc.mock.calls[0]![1].p_program;
    source.sessions[0]!.workout.repeats = 5;
    expect(payload.sessions[0].workout.repeats).toBe(2);
  });
  it("blocks imported copies, incomplete drafts and invalid identities before network writes", async () => {
    for (const p of [
      {
        ...program(),
        origin: {
          creatorName: "Original",
          title: "Copy",
          revision: 1,
          license: "CC-BY-4.0",
          importedAt: 1000,
        },
      },
      { ...program(), sessions: [] },
      { ...program(), id: "local-id" },
    ])
      await expect(
        publishCreatorProgram(p as CreatorProgram),
      ).rejects.toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("bounds encoded UTF-8 bytes rather than counting Unicode characters only", async () => {
    const p = program();
    p.sessions = Array.from({ length: 100 }, (_, i) => ({
      ...p.sessions[0]!,
      id: "session-" + i,
      notes: "漢".repeat(1000),
    }));
    await expect(publishCreatorProgram(p)).rejects.toThrow("too large");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("never reports cloud success when configuration is missing", async () => {
    mock.configured = false;
    await expect(publishCreatorProgram(program())).rejects.toThrow(
      "configured cloud connection",
    );
    await expect(listCreatorPrograms()).rejects.toThrow(
      "configured cloud connection",
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("keeps RPC errors safe while recognizing forbidden ownership/moderation", async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "Private owner SQL detail" },
    });
    await expect(publishCreatorProgram(program())).rejects.toThrow(
      "cannot publish",
    );
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "Private draft content" },
    });
    await expect(publishCreatorProgram(program())).rejects.toThrow(
      "local draft is unchanged",
    );
  });
  it("reads the bounded newest projection and sport filter without fabricated fallback rows", async () => {
    mock.rpc.mockResolvedValueOnce({
      data: [{ program: program() }],
      error: null,
    });
    expect(await listCreatorPrograms("run")).toEqual([{ program: program() }]);
    expect(mock.rpc).toHaveBeenCalledWith("list_creator_programs", {
      p_sport: "run",
    });
  });
  it("rejects malformed, duplicate, excessive and import-state public rows as a complete page", () => {
    const p = program();
    for (const data of [
      null,
      [{ program: { ...p, ownerId: null } }],
      [{ program: p }, { program: p }],
      Array(21).fill({ program: p }),
      [{ program: { ...p, origin: {} } }],
      [
        {
          program: {
            ...p,
            sessions: [
              {
                ...p.sessions[0],
                workout: { ...p.sessions[0]!.workout, repeats: 500 },
              },
            ],
          },
        },
      ],
    ])
      expect(() => decodePublishedCreatorPrograms(data)).toThrow(
        "read completely",
      );
  });
  it("withdraws the exact program and declines invalid sport/id inputs without requests", async () => {
    await unpublishCreatorProgram(id);
    expect(mock.rpc).toHaveBeenCalledWith("unpublish_creator_program", {
      p_id: id,
    });
    mock.rpc.mockClear();
    await expect(unpublishCreatorProgram("bad")).rejects.toThrow();
    await expect(listCreatorPrograms("bad" as "run")).rejects.toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

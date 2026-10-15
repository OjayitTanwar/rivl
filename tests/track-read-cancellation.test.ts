import { beforeEach, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { encodeSamples } from "../src/domain/geo";
import type { Activity, Sample } from "../src/domain/types";
const state = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../src/services/supabase", () => ({ supabase: state }));
vi.mock("../src/services/media", () => ({ photoBytes: vi.fn() }));
vi.mock("../src/storage/database", () => ({ database: new MemoryDatabase() }));
import { database } from "../src/storage/database";
import { downloadTrack } from "../src/services/remote";
const activity = {
  id: "cancel-track",
  ownerId: "owner",
  sync: "synced",
} as Activity;
const points: Sample[] = [
  { lat: 1, lng: 1, t: 1000, accuracy: 1, segment: 0, watts: 100 },
];
function query(result: Promise<unknown>) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    abortSignal: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.maybeSingle.mockReturnValue(result);
  q.abortSignal.mockReturnValue(q);
  state.from.mockReturnValue(q);
  return q;
}
beforeEach(async () => {
  vi.clearAllMocks();
  await database.deleteSamples(activity.id);
});
it("returns history readings without persisting an uncancellable raw cache", async () => {
  query(
    Promise.resolve({
      data: { encoding: "delta-e7-ms-v1", samples: encodeSamples(points) },
      error: null,
    }),
  );
  expect(await downloadTrack(activity, { cache: false })).toHaveLength(1);
  expect(await database.samples(activity.id)).toEqual([]);
});
it("rejects a late result after cancellation even if its provider ignores abort", async () => {
  let finish!: (v: unknown) => void;
  const q = query(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const controller = new AbortController();
  const pending = downloadTrack(activity, { signal: controller.signal });
  await vi.waitFor(() =>
    expect(q.abortSignal).toHaveBeenCalledWith(controller.signal),
  );
  controller.abort();
  finish({
    data: { encoding: "delta-e7-ms-v1", samples: encodeSamples(points) },
    error: null,
  });
  await expect(pending).rejects.toThrow("cancelled");
  expect(await database.samples(activity.id)).toEqual([]);
});

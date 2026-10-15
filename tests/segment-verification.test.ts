import { describe, it, expect, vi } from "vitest";
import {
  verifySegment,
  decodeTrack,
  processSegments,
  type Fix,
  type SegmentPath,
  type SegmentPort,
} from "../supabase/functions/_shared/segment-verification";
import { encodeSamples } from "../src/domain/geo";
const track = (): Fix[] =>
  Array.from({ length: 101 }, (_, i) => ({
    lat: 0,
    lng: i * 0.0001,
    t: 1_000_000 + i * 5000,
    accuracy: 4,
    segment: 0,
  }));
const segment: SegmentPath = {
  id: "segment",
  revision: 1,
  sport: "run",
  points: [
    { lat: 0, lng: 0.003 },
    { lat: 0, lng: 0.007 },
  ],
};
describe("server segment checks", () => {
  it("interpolates an ordered full traversal and records quality provenance", () => {
    const effort = verifySegment(track(), segment);
    expect(effort?.seconds).toBeCloseTo(200);
    expect(effort?.start_ms).toBe(1_150_000);
    expect(effort?.end_ms).toBe(1_350_000);
    expect(effort?.quality.max_accuracy).toBe(4);
  });
  it("rejects reversed, partial and implausibly fast traversals", () => {
    expect(
      verifySegment(
        track().map((p, i) => ({ ...p, lng: (100 - i) * 0.0001 })),
        segment,
      ),
    ).toBeNull();
    expect(
      verifySegment(
        track().filter((_, i) => i < 60),
        segment,
      ),
    ).toBeNull();
    expect(
      verifySegment(
        track().map((p, i) => ({ ...p, t: 1_000_000 + i * 100 })),
        segment,
      ),
    ).toBeNull();
  });
  it("does not bridge GPS gaps, inaccurate fixes, or recording pauses", () => {
    expect(
      verifySegment(
        track().map((p, i) => ({ ...p, t: p.t + (i >= 50 ? 60_000 : 0) })),
        segment,
      ),
    ).toBeNull();
    expect(
      verifySegment(
        track().map((p, i) => ({ ...p, accuracy: i === 50 ? 100 : 4 })),
        segment,
      ),
    ).toBeNull();
    expect(
      verifySegment(
        track().map((p, i) => ({ ...p, segment: i >= 50 ? 1 : 0 })),
        segment,
      ),
    ).toBeNull();
  });
  it("excludes privacy zones and activity endpoints", () => {
    expect(
      verifySegment(track(), segment, [{ lat: 0, lng: 0.005, radius: 50 }]),
    ).toBeNull();
    expect(
      verifySegment(track(), {
        ...segment,
        points: [
          { lat: 0, lng: 0.0005 },
          { lat: 0, lng: 0.003 },
        ],
      }),
    ).toBeNull();
  });
  it("validates encoded raw data", () => {
    expect(decodeTrack(encodeSamples(track()))).toEqual(
      track().map((p) => ({ ...p, lng: Math.round(p.lng * 1e7) / 1e7 })),
    );
    expect(() => decodeTrack([[0, 0, 0]])).toThrow("invalid_track");
  });
  it("never commits unconsented efforts and delegates stale revision rejection to the atomic port", async () => {
    const job = {
      activity_id: "a",
      owner_id: "u",
      revision: 2,
      lease: "lease",
    };
    const complete = vi.fn<SegmentPort["complete"]>(async () => false);
    const port: SegmentPort = {
      claim: async () => job,
      input: async () => ({
        sport: "run",
        public: true,
        optedIn: false,
        raw: null,
        segments: [segment],
        privacy: [],
      }),
      complete,
      retry: async () => {},
    };
    expect(await processSegments(port)).toBe("stale");
    expect(complete.mock.calls[0]?.[1]).toEqual([]);
  });
  it("retries malformed raw inputs without producing rankings", async () => {
    const retry = vi.fn(async () => {}),
      complete = vi.fn(async () => true);
    const port: SegmentPort = {
      claim: async () => ({
        activity_id: "a",
        owner_id: "u",
        revision: 1,
        lease: "l",
      }),
      input: async () => ({
        sport: "run",
        public: true,
        optedIn: true,
        raw: [],
        segments: [segment],
        privacy: [],
      }),
      complete,
      retry,
    };
    expect(await processSegments(port)).toBe("retry");
    expect(complete).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
  });
});

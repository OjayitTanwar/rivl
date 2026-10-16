import { describe, expect, it, vi } from "vitest";
import { mappedTrack } from "../src/domain/community-tracks";
import type { Sample } from "../src/domain/types";
import {
  mappingFingerprint,
  mappingFractionAtMeters,
  prepareMappingInput,
  processTrackMapping,
  trackMeters,
  type TrackMappingInput,
  type TrackMappingPort,
} from "../supabase/functions/_shared/track-mapping-worker";
const job = {
  activity_id: "recording",
  owner_id: "owner",
  revision: 4,
  preference_revision: 2,
  lease: "lease",
};
const samples = (): Sample[] =>
  Array.from({ length: 101 }, (_, i) => ({
    lat: 0,
    lng: i * 0.0001,
    t: 1000000 + i * 2000,
    accuracy: 5,
    segment: 0,
  }));
const input = (): TrackMappingInput => ({
  sport: "run",
  startedAt: 1000000,
  endedAt: 1200000,
  raw: samples(),
  origin: "device-gps",
  privacy: [],
});
const sourceWay = () =>
  mappedTrack(
    { id: 7, version: 2, tags: { highway: "path", foot: "yes" } },
    samples().map(({ lat, lng }) => ({ lat, lng })),
  );
function port(overrides: Partial<TrackMappingPort> = {}): TrackMappingPort {
  return {
    claim: vi.fn(async () => job),
    input: vi.fn(async () => input()),
    ways: vi.fn(async () => [sourceWay()]),
    complete: vi.fn(async () => true),
    retry: vi.fn(async () => {}),
    ...overrides,
  };
}
describe("trusted track mapping preparation", () => {
  it("clips original endpoints by 200m and retains only internal evidence", () => {
    const result = prepareMappingInput(job, input())!;
    expect(result.sourceRevision).toBe(4);
    expect(result.eligibleForPublication).toBe(false);
    expect(result.lines).toHaveLength(1);
    expect(
      result.lines[0]!.every(
        (p) =>
          trackMeters(p, samples()[0]!) > 200 &&
          trackMeters(p, samples()[100]!) > 200,
      ),
    ).toBe(true);
  });
  it("keeps privacy-zone holes disconnected", () => {
    const source = input();
    source.privacy = [{ lat: 0, lng: 0.005, radius: 60 }];
    const result = prepareMappingInput(job, source)!;
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.at(-1)!.lng).toBeLessThan(0.005);
    expect(result.lines[1]![0]!.lng).toBeGreaterThan(0.005);
  });
  it("cuts a sparse edge that crosses a privacy zone even when both fixes are outside", () => {
    const source = input();
    source.privacy = [{ lat: 0, lng: 0.00505, radius: 3 }];
    const result = prepareMappingInput(job, source)!;
    expect(result.lines).toHaveLength(2);
    expect(
      result.lines.every(
        (line) =>
          !line.some(
            (point, i) =>
              i > 0 && line[i - 1]!.lng < 0.00505 && point.lng > 0.00505,
          ),
      ),
    ).toBe(true);
  });
  it("splits long sample gaps and rejects reversed-clock fixes without reconnecting", () => {
    const source = input();
    const raw = source.raw as Sample[];
    for (let i = 50; i < raw.length; i++) raw[i]!.t += 30000;
    source.endedAt += 30000;
    expect(prepareMappingInput(job, source)!.lines).toHaveLength(2);
    const reversed = input();
    (reversed.raw as Sample[])[50]!.t = 1000000;
    const result = prepareMappingInput(job, reversed)!;
    expect(result.lines).toHaveLength(2);
    expect(result.rejectedSamples).toBeGreaterThan(0);
  });
  it("rejects malformed endpoints, foreign origins, excessive payloads and privacy limits", () => {
    const bad = input();
    (bad.raw as Sample[])[0]!.accuracy = NaN;
    expect(() => prepareMappingInput(job, bad)).toThrow(
      "invalid_mapping_endpoints",
    );
    expect(() =>
      prepareMappingInput(job, {
        ...input(),
        origin: "import",
      } as unknown as TrackMappingInput),
    ).toThrow("invalid_mapping_input");
    expect(() =>
      prepareMappingInput(job, {
        ...input(),
        raw: Array(100001).fill(samples()[0]),
      }),
    ).toThrow("invalid_mapping_input");
    expect(() =>
      prepareMappingInput(job, {
        ...input(),
        privacy: [{ lat: 0, lng: 0, radius: -1 }],
      }),
    ).toThrow("invalid_mapping_input");
  });
  it("returns no geometry for short journeys entirely hidden by endpoints", () => {
    const source = input();
    source.raw = (source.raw as Sample[]).slice(0, 21);
    expect(prepareMappingInput(job, source)).toBeNull();
  });
});
describe("leased track mapping processor", () => {
  it("returns idle without fetching or completing", async () => {
    const p = port({ claim: vi.fn(async () => null) });
    expect(await processTrackMapping(p)).toBe("idle");
    expect(p.input).not.toHaveBeenCalled();
    expect(p.complete).not.toHaveBeenCalled();
  });
  it("returns stale for a withdrawn input without completing or retrying", async () => {
    const p = port({ input: vi.fn(async () => null) });
    expect(await processTrackMapping(p)).toBe("stale");
    expect(p.complete).not.toHaveBeenCalled();
    expect(p.retry).not.toHaveBeenCalled();
  });
  it("passes only an inward-rounded partial OSM interval, preserving revision and lease", async () => {
    const p = port();
    expect(await processTrackMapping(p)).toBe("processed");
    const [claimed, ways, support, algorithm, fingerprint] = (
      p.complete as ReturnType<typeof vi.fn>
    ).mock.calls[0]!;
    expect(claimed).toEqual(job);
    expect(ways[0].version).toBe(2);
    expect(algorithm).toBe("track-reconstruction-v1");
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(support).toHaveLength(1);
    expect(support[0]).toMatchObject({ wayId: 7, version: 2 });
    expect(support[0].start).toBeGreaterThan(0);
    expect(support[0].end).toBeLessThan(1000);
    expect(p.retry).not.toHaveBeenCalled();
  });
  it("does not complete ambiguous parallel paths as mapped support", async () => {
    const parallel = {
      ...sourceWay(),
      wayId: 8,
      points: sourceWay().points.map((v) => ({ ...v, lat: 0.0001 })),
    };
    const p = port({ ways: vi.fn(async () => [sourceWay(), parallel]) });
    expect(await processTrackMapping(p)).toBe("processed");
    expect((p.complete as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toEqual(
      [],
    );
  });
  it("returns stale when transactional completion rejects changed revisions", async () => {
    const p = port({ complete: vi.fn(async () => false) });
    expect(await processTrackMapping(p)).toBe("stale");
    expect(p.retry).not.toHaveBeenCalled();
  });
  it("retries rejected network timeouts without committing", async () => {
    const p = port({
      ways: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    expect(await processTrackMapping(p)).toBe("retry");
    expect(p.retry).toHaveBeenCalledWith(job);
    expect(p.complete).not.toHaveBeenCalled();
  });
  it("rejects source-network count bounds before reconstruction", async () => {
    const p = port({
      ways: vi.fn(async () => Array.from({ length: 501 }, () => sourceWay())),
    });
    expect(await processTrackMapping(p)).toBe("retry");
    expect(p.complete).not.toHaveBeenCalled();
  });
  it("commits an empty support replacement for newly unusable evidence", async () => {
    const tiny = input();
    tiny.raw = (tiny.raw as Sample[]).slice(0, 21);
    const p = port({ input: vi.fn(async () => tiny) });
    expect(await processTrackMapping(p)).toBe("processed");
    expect(p.ways).not.toHaveBeenCalled();
    expect((p.complete as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toEqual(
      [],
    );
  });
  it("retries a genuinely never-settling provider after the enforced deadline", async () => {
    vi.useFakeTimers();
    try {
      const p = port({
        ways: vi.fn(
          () => new Promise<ReturnType<typeof sourceWay>[]>(() => {}),
        ),
      });
      const processing = processTrackMapping(p);
      await vi.advanceTimersByTimeAsync(20001);
      expect(await processing).toBe("retry");
      expect(p.retry).toHaveBeenCalledWith(job);
      expect(p.complete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("fingerprints canonical geometry independent of direction and fragment ordering", async () => {
    const a = samples()
      .slice(0, 20)
      .map(({ lat, lng }) => ({ lat, lng }));
    const b = samples()
      .slice(60, 80)
      .map(({ lat, lng }) => ({ lat, lng }));
    const fingerprint = await mappingFingerprint([a, b]);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await mappingFingerprint([[...b].reverse(), [...a].reverse()])).toBe(
      fingerprint,
    );
    expect(await mappingFingerprint([a.slice(1), b])).not.toBe(fingerprint);
  });
  it("converts high-latitude L-bend support to PostGIS degree fractions", () => {
    const points = [
      { lat: 70, lng: 10 },
      { lat: 70, lng: 10.01 },
      { lat: 70.01, lng: 10.01 },
    ];
    const first = trackMeters(points[0]!, points[1]!),
      second = trackMeters(points[1]!, points[2]!);
    expect(mappingFractionAtMeters(points, first)).toBeCloseTo(0.5, 8);
    expect(first / (first + second)).toBeLessThan(0.3);
    expect(mappingFractionAtMeters(points, first + second / 2)).toBeCloseTo(
      0.75,
      8,
    );
    expect(mappingFractionAtMeters(points, first + second + 100)).toBe(1);
  });
});

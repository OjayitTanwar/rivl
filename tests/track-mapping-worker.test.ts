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

const cohortMeter = 111195;
function cohortInput(index: number): TrackMappingInput {
  const startedAt = Date.parse("2026-10-10T00:00:00Z") + (index % 3) * 86400000;
  return {
    sport: "run",
    startedAt,
    endedAt: startedAt + 200000,
    origin: "device-gps",
    privacy: [],
    raw: Array.from({ length: 101 }, (_, i) => ({
      lat: (index * 0.4) / cohortMeter,
      lng: (i * 10) / cohortMeter,
      t: startedAt + i * 2000,
      accuracy: 5,
      segment: 0,
    })),
  };
}
function cohortNeighbors(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    activity_id: `neighbor-${i + 1}`,
    owner_id: `owner-${i + 1}`,
    revision: 1,
    preference_revision: 1,
    input: cohortInput(i + 1),
  }));
}
function completedCorridors(p: TrackMappingPort) {
  return (p.complete as ReturnType<typeof vi.fn>).mock.calls[0]?.[5] as {
    geometry: { lat: number; lng: number }[];
    support: { activityId: string; fingerprint: string }[];
  }[];
}
describe("unmapped corridor worker integration", () => {
  it("prepares each independent original trace and forwards exact support references as proposals only", async () => {
    const p = port({
      input: vi.fn(async () => cohortInput(0)),
      ways: vi.fn(async () => []),
      neighbors: vi.fn(async () => cohortNeighbors()),
    });
    expect(await processTrackMapping(p)).toBe("processed");
    const proposals = completedCorridors(p);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0]!.support).toHaveLength(5);
    expect(new Set(proposals[0]!.support.map((s) => s.fingerprint)).size).toBe(
      5,
    );
    expect(proposals[0]!.support.map((s) => s.activityId)).toContain(
      job.activity_id,
    );
    for (const candidate of proposals)
      expect(
        candidate.geometry.every(
          (point) =>
            trackMeters(point, (cohortInput(0).raw as Sample[])[0]!) > 200 &&
            trackMeters(point, (cohortInput(0).raw as Sample[])[100]!) > 200,
        ),
      ).toBe(true);
    expect((p.complete as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toEqual(
      [],
    );
  });
  it("never reconstructs ambiguous fixes beside split OSM ways as a new path", async () => {
    const adjacent = [
      { from: 200, to: 500, id: 901 },
      { from: 500, to: 800, id: 902 },
    ].map(({ from, to, id }) =>
      mappedTrack(
        { id, version: 1, tags: { highway: "path", foot: "yes" } },
        Array.from({ length: (to - from) / 10 + 1 }, (_, i) => ({
          lat: 30 / cohortMeter,
          lng: (from + i * 10) / cohortMeter,
        })),
      ),
    );
    const p = port({
      input: vi.fn(async () => cohortInput(0)),
      ways: vi.fn(async () => adjacent),
      neighbors: vi.fn(async () => cohortNeighbors()),
    });
    expect(await processTrackMapping(p)).toBe("processed");
    expect(completedCorridors(p)).toEqual([]);
    expect((p.complete as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toEqual(
      [],
    );
  });
  it("does not join a relay of different supporters across the entire proposed centerline", async () => {
    const neighbors = cohortNeighbors(7);
    for (let index = 0; index < neighbors.length; index++) {
      if (index >= 3)
        neighbors[index]!.input.privacy = [
          { lat: 0, lng: (index < 5 ? 650 : 350) / cohortMeter, radius: 150 },
        ];
    }
    const p = port({
      input: vi.fn(async () => cohortInput(0)),
      ways: vi.fn(async () => []),
      neighbors: vi.fn(async () => neighbors),
    });
    expect(await processTrackMapping(p)).toBe("processed");
    const proposals = completedCorridors(p);
    expect(proposals.length).toBeGreaterThan(0);
    for (const candidate of proposals) {
      const longitudes = candidate.geometry.map((v) => v.lng * cohortMeter);
      expect(
        Math.min(...longitudes) < 450 && Math.max(...longitudes) > 550,
      ).toBe(false);
      expect(candidate.support.length).toBeGreaterThanOrEqual(5);
    }
  });
  it("cannot replace a revoked fifth source with repeated owners or copied geometry", async () => {
    for (const neighbors of [
      cohortNeighbors(3),
      cohortNeighbors().map((n) => ({ ...n, owner_id: "same-owner" })),
      cohortNeighbors().map((n) => ({ ...n, input: cohortInput(0) })),
    ]) {
      const p = port({
        input: vi.fn(async () => cohortInput(0)),
        ways: vi.fn(async () => []),
        neighbors: vi.fn(async () => neighbors),
      });
      expect(await processTrackMapping(p)).toBe("processed");
      expect(completedCorridors(p)).toEqual([]);
    }
  });
  it("re-prepares neighbor privacy zones and fails closed on malformed source privacy", async () => {
    const protectedNeighbors = cohortNeighbors();
    protectedNeighbors[0]!.input.privacy = [
      { lat: 0, lng: 500 / cohortMeter, radius: 500 },
    ];
    const p = port({
      input: vi.fn(async () => cohortInput(0)),
      ways: vi.fn(async () => []),
      neighbors: vi.fn(async () => protectedNeighbors),
    });
    expect(await processTrackMapping(p)).toBe("processed");
    expect(completedCorridors(p)).toEqual([]);
    const invalid = cohortNeighbors();
    invalid[0]!.input.privacy = [{ lat: 0, lng: 0, radius: NaN }];
    const rejected = port({
      input: vi.fn(async () => cohortInput(0)),
      ways: vi.fn(async () => []),
      neighbors: vi.fn(async () => invalid),
    });
    expect(await processTrackMapping(rejected)).toBe("retry");
    expect(rejected.complete).not.toHaveBeenCalled();
  });
  it("rejects excessive neighbor cohorts without committing partial mapped support", async () => {
    const p = port({
      input: vi.fn(async () => cohortInput(0)),
      ways: vi.fn(async () => []),
      neighbors: vi.fn(async () => cohortNeighbors(13)),
    });
    expect(await processTrackMapping(p)).toBe("retry");
    expect(p.complete).not.toHaveBeenCalled();
  });
  it("lets transactional completion reject source revocation after reconstruction", async () => {
    const p = port({
      input: vi.fn(async () => cohortInput(0)),
      ways: vi.fn(async () => []),
      neighbors: vi.fn(async () => cohortNeighbors()),
      complete: vi.fn(async () => false),
    });
    expect(await processTrackMapping(p)).toBe("stale");
    expect(completedCorridors(p).length).toBeGreaterThan(0);
    expect(p.retry).not.toHaveBeenCalled();
  });
});

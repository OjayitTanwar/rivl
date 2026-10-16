import { describe, it, expect } from "vitest";
import { reconstructCommunityTracks } from "../src/domain/track-reconstruction";
import {
  mappedTrack,
  type PreparedTrackEvidence,
} from "../src/domain/community-tracks";
const line = (lat = 0, start = 0) =>
  Array.from({ length: 21 }, (_, i) => ({ lat, lng: start + i * 0.0001 }));
const way = (id = 1, lat = 0) =>
  mappedTrack(
    { id, version: 3, tags: { highway: "path", foot: "yes" } },
    line(lat),
  );
const observation = (
  ownerId = "a",
  day = "2026-10-10",
  lat = 0,
  start = 0,
) => ({
  ownerId,
  observedDay: day,
  evidence: {
    sourceActivityId: ownerId,
    sourceRevision: 1,
    sport: "run",
    origin: "device-gps",
    algorithmVersion: "gps-track-evidence-v1",
    evidenceCategory: "gps_observed_use",
    status: "unverified",
    lines: [line(lat, start)],
    acceptedSamples: 21,
    rejectedSamples: 0,
    eligibleForPublication: false,
  } as PreparedTrackEvidence,
});
describe("private track reconstruction", () => {
  it("matches retained way intervals with OSM revision and never enables routing/publication", () => {
    const result = reconstructCommunityTracks([observation()], [way()]);
    expect(result.fragments[0]?.outcome).toBe("mapped");
    expect(result.fragments[0]?.mappedInterval?.version).toBe(3);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(
      result.candidates.every(
        (c) =>
          c.key.startsWith("osm:1:3:") &&
          !c.routingEligible &&
          !c.publicationEligible &&
          c.legalAccess === "unknown",
      ),
    ).toBe(true);
  });
  it("keeps parallel paths ambiguous including mapped bridges", () => {
    const bridge = { ...way(2, 0.0001), bridge: true, layer: 1 };
    const result = reconstructCommunityTracks([observation()], [way(), bridge]);
    expect(result.fragments[0]?.outcome).toBe("ambiguous");
    expect(result.candidates).toEqual([]);
  });
  it("requires five independent owners across three distinct owner days", () => {
    const observations = Array.from({ length: 5 }, (_, i) =>
      observation(String(i), `2026-10-${10 + (i % 3)}`, i * 0.000001),
    );
    expect(
      reconstructCommunityTracks(observations, [way()]).candidates.some(
        (c) => c.status === "corroborated",
      ),
    ).toBe(true);
    expect(
      reconstructCommunityTracks(observations.slice(0, 4), [
        way(),
      ]).candidates.every((c) => c.status === "unverified"),
    ).toBe(true);
    expect(
      reconstructCommunityTracks(
        observations.map((o) => ({ ...o, observedDay: "2026-10-10" })),
        [way()],
      ).candidates.every((c) => c.status === "unverified"),
    ).toBe(true);
  });
  it("quarantines identical geometry across accounts in either direction", () => {
    const a = observation(),
      b = observation("b");
    b.evidence.lines[0]!.reverse();
    expect(
      reconstructCommunityTracks([a, b], [way()]).rejected.map((r) => r.reason),
    ).toEqual(["duplicate_geometry", "duplicate_geometry"]);
  });
  it("never connects independent fragments or publishes unmapped precise geometry", () => {
    const o = observation();
    o.evidence.lines.push(line(0.01));
    const result = reconstructCommunityTracks([o], []);
    expect(result.fragments).toHaveLength(2);
    expect(result.fragments.every((f) => f.outcome === "unmapped")).toBe(true);
    expect(
      result.candidates.every(
        (c) => c.requiresReview && !c.publicationEligible,
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('"lat"');
  });
  it("rejects invalid coordinates, teleports, impossible dates, imported sources and budgets", () => {
    const malformed = observation();
    malformed.evidence.lines[0]![4]!.lat = NaN;
    const jump = observation("b");
    jump.evidence.lines[0]![4]!.lat = 5;
    const imported = observation("c");
    Object.assign(imported.evidence, { origin: "import" });
    expect(
      reconstructCommunityTracks(
        [malformed, jump, imported, observation("d", "2026-02-30")],
        [],
      ).rejected,
    ).toHaveLength(4);
    expect(
      reconstructCommunityTracks(
        Array.from({ length: 101 }, () => observation()),
        [],
      ).incomplete,
    ).toBe(true);
  });
  it("does not treat a missing source revision as licensed matched geometry", () => {
    const unversioned = { ...way(), version: undefined };
    expect(
      reconstructCommunityTracks([observation()], [unversioned]).fragments[0]
        ?.outcome,
    ).toBe("ambiguous");
  });
  it("never corroborates a whole way from disjoint short observations", () => {
    const longWay = mappedTrack(
      { id: 1, version: 3, tags: { highway: "path" } },
      Array.from({ length: 101 }, (_, i) => ({ lat: 0, lng: i * 0.0001 })),
    );
    const input = Array.from({ length: 5 }, (_, i) =>
      observation(
        String(i),
        `2026-10-${10 + (i % 3)}`,
        i * 0.000001,
        i < 3 ? 0 : 0.007,
      ),
    );
    const result = reconstructCommunityTracks(input, [longWay]);
    expect(result.candidates.every((c) => c.status === "unverified")).toBe(
      true,
    );
    expect(
      result.fragments.every(
        (f) =>
          f.mappedInterval &&
          f.mappedInterval.endMeters - f.mappedInterval.startMeters < 230,
      ),
    ).toBe(true);
  });
  it("bounds malformed runtime input without throwing", () => {
    const broken = observation();
    Object.assign(broken.evidence, { lines: 42 });
    expect(reconstructCommunityTracks([broken], []).rejected).toHaveLength(1);
  });
  it("matches separate contiguous runs when one journey crosses two OSM ways", () => {
    const points = Array.from({ length: 81 }, (_, i) => ({
      lat: 0,
      lng: i * 0.0001,
    }));
    const first = mappedTrack(
      { id: 11, version: 2, tags: { highway: "path" } },
      points.slice(0, 41),
    );
    const second = mappedTrack(
      { id: 12, version: 9, tags: { highway: "path" } },
      points.slice(40),
    );
    const o = observation();
    o.evidence.lines = [points];
    const result = reconstructCommunityTracks([o], [first, second]);
    const spans = result.fragments.filter((f) => f.outcome === "mapped");
    expect(spans.map((f) => f.wayIds)).toEqual([[11], [12]]);
    expect(spans.every((f) => f.fragment === 0)).toBe(true);
    expect(result.fragments.some((f) => f.outcome === "ambiguous")).toBe(true);
    expect(spans[0]!.mappedInterval!.endMeters).toBeLessThan(440);
    expect(spans[1]!.mappedInterval!.startMeters).toBeGreaterThan(0);
  });
  it("never stitches disconnected fragments into a longer support interval on the same way", () => {
    const points = Array.from({ length: 101 }, (_, i) => ({
      lat: 0,
      lng: i * 0.0001,
    }));
    const w = mappedTrack(
      { id: 15, version: 1, tags: { highway: "path" } },
      points,
    );
    const o = observation();
    o.evidence.lines = [points.slice(0, 21), points.slice(70, 91)];
    const spans = reconstructCommunityTracks([o], [w]).fragments.filter(
      (f) => f.outcome === "mapped",
    );
    expect(spans).toHaveLength(2);
    expect(spans.map((f) => f.fragment)).toEqual([0, 1]);
    expect(spans[0]!.mappedInterval!.endMeters).toBeLessThan(
      spans[1]!.mappedInterval!.startMeters,
    );
  });
  it("retains a sparse long-edge parallel road as an ambiguity blocker", () => {
    const road = mappedTrack(
      { id: 22, version: 1, tags: { highway: "residential" } },
      [
        { lat: 0.0001, lng: -0.001 },
        { lat: 0.0001, lng: 0.004 },
      ],
    );
    const result = reconstructCommunityTracks([observation()], [way(), road]);
    expect(result.fragments.some((f) => f.outcome === "mapped")).toBe(false);
    expect(result.fragments.every((f) => f.outcome === "ambiguous")).toBe(true);
    expect(result.candidates).toEqual([]);
  });
  it("retains unversioned or unknown-kind parallel geometry as an ambiguity blocker", () => {
    for (const blocker of [
      { ...way(2, 0.0001), version: undefined },
      { ...way(2, 0.0001), geometryKind: "unknown" as const },
    ]) {
      const result = reconstructCommunityTracks(
        [observation()],
        [way(), blocker],
      );
      expect(result.fragments.some((f) => f.outcome === "mapped")).toBe(false);
      expect(result.candidates).toEqual([]);
    }
  });
  it("filters hundreds of remote ways without consuming segment budget or losing nearby ambiguity", () => {
    const o = observation();
    o.evidence.lines = [
      Array.from({ length: 251 }, (_, i) => ({ lat: 0, lng: i * 0.00001 })),
    ];
    const near = mappedTrack(
      { id: 1, version: 2, tags: { highway: "path" } },
      o.evidence.lines[0]!,
    );
    const parallel = {
      ...near,
      wayId: 2,
      points: near.points.map((v) => ({ ...v, lat: 0.0001 })),
    };
    const remote = Array.from({ length: 450 }, (_, index) =>
      mappedTrack(
        { id: 100 + index, version: 1, tags: { highway: "path" } },
        Array.from({ length: 35 }, (_, i) => ({
          lat: 20 + index * 0.001,
          lng: 10 + i * 0.0001,
        })),
      ),
    );
    const baseline = reconstructCommunityTracks([o], [near, parallel]);
    const actual = reconstructCommunityTracks([o], [near, ...remote, parallel]);
    expect(actual.incomplete).toBe(false);
    expect(actual.fragments).toEqual(baseline.fragments);
    expect(actual.candidates).toEqual([]);
  });
});

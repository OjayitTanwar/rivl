import { describe, expect, it } from "vitest";
import {
  mappedTrack,
  prepareTrackEvidence,
} from "../src/domain/community-tracks";
import { decodePathNetwork, pathQuery } from "../src/services/path-network";
import { processActivity } from "../src/domain/processing";
import { distance } from "../src/domain/geo";
import type { Activity, Sample, Sport } from "../src/domain/types";

const points = (): Sample[] =>
  Array.from({ length: 81 }, (_, i) => ({
    lat: 0,
    lng: i * 0.00015,
    t: 1000000 + i * 10000,
    accuracy: 5,
    segment: 0,
  }));
const activity = (sport: Sport = "run"): Activity => ({
  id: "workout",
  ownerId: "me",
  title: "Recorded outing",
  sport,
  startedAt: 1000000,
  endedAt: 1800000,
  route: [],
  summary: processActivity([], sport, 1000000, 1800000),
  visibility: "private",
  note: "",
  rpe: 5,
  revision: 1,
  photos: [],
  sync: "local",
});
const geometry = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.001 },
];
describe("mapped infrastructure provenance", () => {
  it("honors explicit mode exceptions and vehicle inheritance without erasing restrictions", () => {
    const feature = mappedTrack(
      { tags: { highway: "footway", access: "no", foot: "yes" } },
      geometry,
    );
    expect(feature.footAccess).toBe("mapped_allowed");
    expect(feature.bicycleAccess).toBe("mapped_restricted");
    expect(
      mappedTrack({ tags: { highway: "cycleway", vehicle: "no" } }, geometry)
        .bicycleAccess,
    ).toBe("mapped_restricted");
    const decoded = decodePathNetwork(
      {
        elements: [
          {
            type: "way",
            tags: { highway: "footway", access: "no", foot: "yes" },
            geometry: geometry.map((p) => ({ lat: p.lat, lon: p.lng })),
          },
        ],
      },
      "walk",
    );
    expect(decoded.lines).toHaveLength(1);
  });
  it("retains IDs, topology and source restrictions without inferring motor protection", () => {
    const feature = mappedTrack(
      {
        id: 42,
        version: 3,
        nodes: [11, 12],
        tags: {
          highway: "cycleway",
          foot: "no",
          bicycle: "designated",
          segregated: "yes",
          surface: "asphalt",
          bridge: "yes",
          layer: "1",
          "oneway:bicycle": "-1",
          name: "unretained",
        },
      },
      geometry,
    );
    expect(feature).toMatchObject({
      wayId: 42,
      version: 3,
      nodeIds: [11, 12],
      kind: "cycleway",
      footAccess: "mapped_restricted",
      bicycleAccess: "mapped_allowed",
      userSegregation: "mapped_segregated",
      motorProtection: "unknown",
      bicycleDirection: "reverse",
      bridge: true,
      layer: 1,
      surface: "asphalt",
    });
    expect(feature.tags).not.toHaveProperty("name");
  });
  it("distinguishes painted lanes, shared lanes, paths and unknown permissions", () => {
    expect(
      mappedTrack(
        { tags: { highway: "residential", "cycleway:left": "lane" } },
        geometry,
      ).kind,
    ).toBe("painted_cycle_lane");
    expect(
      mappedTrack(
        { tags: { highway: "residential", cycleway: "shared_lane" } },
        geometry,
      ).kind,
    ).toBe("shared_cycle_lane");
    expect(
      mappedTrack(
        { tags: { highway: "path", foot: "designated", bicycle: "yes" } },
        geometry,
      ).kind,
    ).toBe("shared_path");
    expect(
      mappedTrack({ tags: { highway: "footway" } }, geometry).footAccess,
    ).toBe("unknown");
    expect(
      mappedTrack(
        {
          tags: {
            highway: "path",
            foot: "yes",
            "foot:conditional": "no @ night",
          },
        },
        geometry,
      ).footAccess,
    ).toBe("conditional");
  });
  it("does not fabricate malformed source IDs or accept incomplete topology", () => {
    const feature = mappedTrack(
      {
        id: NaN,
        version: -1,
        nodes: [1],
        tags: { highway: [], surface: {}, layer: "wrong" },
      },
      geometry,
    );
    expect(feature).not.toHaveProperty("wayId");
    expect(feature).not.toHaveProperty("nodeIds");
    expect(feature).toMatchObject({
      kind: "unknown",
      layer: null,
      surface: null,
    });
  });
  it("discovers running tracks and allowed forest tracks, with polygon outlines excluded from offline routing", () => {
    expect(pathQuery({ lat: 0, lng: 0 }, "run")).toContain("[leisure=track]");
    expect(pathQuery({ lat: 0, lng: 0 }, "hike")).toContain(
      "[highway=track][foot",
    );
    const decoded = decodePathNetwork(
      {
        elements: [
          {
            type: "way",
            id: 42,
            nodes: [11, 12],
            tags: { leisure: "track", sport: "athletics", area: "yes" },
            geometry: geometry.map((p) => ({ lat: p.lat, lon: p.lng })),
          },
        ],
      },
      "all",
    );
    expect(decoded.features?.[0]).toMatchObject({
      kind: "running_track",
      geometryKind: "area",
      wayId: 42,
    });
    expect(decoded.lines).toHaveLength(1);
    expect(decoded.walkingLines).toEqual([]);
    expect(
      mappedTrack({ tags: { leisure: "track", sport: "athletics" } }, geometry)
        .geometryKind,
    ).toBe("unknown");
  });
});
describe("GPS track evidence preparation", () => {
  it("declines unsupported wrap/polar geometry and invalid zones instead of exposing an incorrect corridor", () => {
    expect(
      prepareTrackEvidence(
        activity(),
        points().map((p) => ({ ...p, lat: 89 })),
        "me",
        "device-gps",
      ).reason,
    ).toBe("unsupported_region");
    const wrap = points();
    wrap[40]!.lng = 179.9999;
    wrap[41]!.lng = -179.9999;
    expect(
      prepareTrackEvidence(activity(), wrap, "me", "device-gps").reason,
    ).toBe("unsupported_region");
    expect(
      prepareTrackEvidence(activity(), points(), "me", "device-gps", [
        { id: "zone", label: "Place", lat: NaN, lng: 0, radius: 200 },
      ]).reason,
    ).toBe("bounds");
  });
  it.each(["run", "ride", "walk", "hike"] as const)(
    "prepares %s evidence without claiming public verification or retaining clocks/sensors",
    (sport) => {
      const raw = points(),
        before = JSON.stringify(raw);
      const result = prepareTrackEvidence(
        activity(sport),
        raw,
        "me",
        "device-gps",
      );
      expect(result.reason).toBeNull();
      expect(result.evidence).toMatchObject({
        sourceRevision: 1,
        sport,
        origin: "device-gps",
        status: "unverified",
        evidenceCategory: "gps_observed_use",
        eligibleForPublication: false,
      });
      const coordinates = result.evidence!.lines.flat();
      expect(distance(coordinates[0]!, raw[0]!)).toBeGreaterThanOrEqual(200);
      expect(distance(coordinates.at(-1)!, raw.at(-1)!)).toBeGreaterThanOrEqual(
        200,
      );
      expect(Object.keys(coordinates[0]!)).toEqual(["lat", "lng"]);
      expect(JSON.stringify(raw)).toBe(before);
    },
  );
  it("rejects foreign, simulated, manual and imported evidence", () => {
    expect(
      prepareTrackEvidence(activity(), points(), "other", "device-gps").reason,
    ).toBe("owner");
    for (const origin of ["manual", "import"] as const)
      expect(
        prepareTrackEvidence(activity(), points(), "me", origin).reason,
      ).toBe("source");
    expect(
      prepareTrackEvidence(
        { ...activity(), simulated: true },
        points(),
        "me",
        "device-gps",
      ).reason,
    ).toBe("source");
    expect(
      prepareTrackEvidence(
        { ...activity(), demo: true },
        points(),
        "me",
        "watch-gps",
      ).reason,
    ).toBe("source");
  });
  it("splits at low-accuracy fixes rather than reconnecting across the missing corridor", () => {
    const raw = points();
    raw[40]!.accuracy = 50;
    const result = prepareTrackEvidence(activity(), raw, "me", "watch-gps");
    expect(result.evidence!.lines).toHaveLength(2);
    expect(result.evidence!.rejectedSamples).toBe(1);
    expect(result.evidence!.lines[0]!.at(-1)!.lng).toBeLessThan(raw[40]!.lng);
    expect(result.evidence!.lines[1]![0]!.lng).toBeGreaterThan(raw[40]!.lng);
  });
  it("breaks impossible movements, repeated timestamps and pause segments", () => {
    for (const patch of [{ lng: 1 }, { t: points()[39]!.t }, { segment: 1 }]) {
      const raw = points();
      Object.assign(raw[40]!, patch);
      const result = prepareTrackEvidence(activity(), raw, "me", "device-gps");
      expect(result.evidence!.lines.length).toBeGreaterThan(1);
      expect(
        result.evidence!.lines.every((line) => line.every((p) => p.lng < 0.02)),
      ).toBe(true);
    }
  });
  it("does not bridge a sparse edge through a protected interior place", () => {
    const raw = points();
    const result = prepareTrackEvidence(activity(), raw, "me", "device-gps", [
      { id: "place", label: "Place", lat: 0, lng: raw[40]!.lng, radius: 100 },
    ]);
    expect(result.evidence!.lines).toHaveLength(2);
    for (const line of result.evidence!.lines)
      for (const p of line)
        expect(distance(p, raw[40]!)).toBeGreaterThanOrEqual(100);
  });
  it("declines short, unbounded and wholly noisy outings instead of inventing a candidate", () => {
    expect(
      prepareTrackEvidence(activity(), points().slice(0, 4), "me", "device-gps")
        .reason,
    ).toBe("no_usable_geometry");
    expect(
      prepareTrackEvidence(
        activity(),
        points().map((p) => ({ ...p, accuracy: 30 })),
        "me",
        "device-gps",
      ).evidence,
    ).toBeNull();
    expect(
      prepareTrackEvidence(
        { ...activity(), revision: 0 },
        points(),
        "me",
        "device-gps",
      ).reason,
    ).toBe("bounds");
    expect(
      prepareTrackEvidence(
        activity(),
        Array(100001).fill(points()[0]),
        "me",
        "device-gps",
      ).reason,
    ).toBe("bounds");
  });
});

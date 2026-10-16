import { describe, expect, it } from "vitest";
import {
  buildUnmappedProposals,
  clipMappingRegion,
} from "../supabase/functions/_shared/unmapped-track-worker";
import { mappedTrack } from "../src/domain/community-tracks";
import type { ReconstructionObservation } from "../src/domain/track-reconstruction";
const M = 111195;
const center = { lat: 0, lng: 150 / M };
function observation(i: number): ReconstructionObservation {
  const line = Array.from({ length: 31 }, (_, j) => ({
    lat: (i * 0.4) / M,
    lng: (j * 10) / M,
  }));
  return {
    ownerId: `owner-${i}`,
    observedDay: `2026-10-${10 + (i % 3)}`,
    evidence: {
      sourceActivityId: `activity-${i}`,
      sourceRevision: 1,
      sport: "run",
      origin: "device-gps",
      algorithmVersion: "gps-track-evidence-v1",
      evidenceCategory: "gps_observed_use",
      status: "unverified",
      lines: [line],
      acceptedSamples: line.length,
      rejectedSamples: 0,
      eligibleForPublication: false,
    },
  };
}
const observations = () => Array.from({ length: 5 }, (_, i) => observation(i));
const references = () =>
  Array.from({ length: 5 }, (_, i) => ({
    activityId: `activity-${i}`,
    revision: 1,
    preferenceRevision: 2,
    fingerprint: String(i).padStart(64, "0"),
  }));
describe("trusted unmapped worker hypotheses", () => {
  it("returns independently supported internal centerlines with exact source references", () => {
    const result = buildUnmappedProposals(
      observations(),
      references(),
      [],
      center,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.sport).toBe("run");
    expect(result[0]?.support).toEqual(expect.arrayContaining(references()));
    expect(result[0]?.support).toHaveLength(5);
    expect(result[0]?.geometry.length).toBeGreaterThan(10);
  });
  it("requires five different owners, representative days and fingerprints", () => {
    expect(
      buildUnmappedProposals(
        observations().slice(0, 4),
        references().slice(0, 4),
        [],
        center,
      ),
    ).toEqual([]);
    expect(
      buildUnmappedProposals(
        observations().map((o) => ({ ...o, ownerId: "one" })),
        references(),
        [],
        center,
      ),
    ).toEqual([]);
    expect(
      buildUnmappedProposals(
        observations().map((o) => ({ ...o, observedDay: "2026-10-10" })),
        references(),
        [],
        center,
      ),
    ).toEqual([]);
    expect(
      buildUnmappedProposals(
        observations(),
        references().map((r) => ({ ...r, fingerprint: "a".repeat(64) })),
        [],
        center,
      ),
    ).toEqual([]);
  });
  it("does not reinterpret mapped or parallel ambiguous geometry as a new path", () => {
    const way = mappedTrack(
      { id: 1, version: 1, tags: { highway: "path", foot: "yes" } },
      observation(0).evidence.lines[0]!,
    );
    expect(
      buildUnmappedProposals(observations(), references(), [way], center),
    ).toEqual([]);
    const left = {
      ...way,
      wayId: 2,
      points: way.points.map((p) => ({ ...p, lat: p.lat - 5 / M })),
    };
    const right = {
      ...way,
      wayId: 3,
      points: way.points.map((p) => ({ ...p, lat: p.lat + 5 / M })),
    };
    expect(
      buildUnmappedProposals(
        observations(),
        references(),
        [left, right],
        center,
      ),
    ).toEqual([]);
  });
  it("rejects missing, mismatched and stale source references", () => {
    expect(() =>
      buildUnmappedProposals(observations(), references().slice(1), [], center),
    ).toThrow("corridor_cohort_bound");
    for (const refs of [
      references().map((r) => ({ ...r, revision: 2 })),
      references().map((r) => ({ ...r, fingerprint: "invalid" })),
      references().map((r) => ({ ...r, preferenceRevision: 0 })),
    ])
      expect(() =>
        buildUnmappedProposals(observations(), refs, [], center),
      ).toThrow("invalid_corridor_reference");
  });
  it("clips only original fixes and splits excursions instead of connecting across them", () => {
    const first = Array.from({ length: 12 }, (_, i) => ({
      lat: 0,
      lng: (i * 10) / M,
    }));
    const second = Array.from({ length: 12 }, (_, i) => ({
      lat: 20 / M,
      lng: (i * 10) / M,
    }));
    const outside = { lat: 0, lng: 500 / M };
    const result = clipMappingRegion([[...first, outside, ...second]], {
      lat: 0,
      lng: 0,
    });
    expect(result).toEqual([first, second]);
    expect(
      result
        .flat()
        .every((p) =>
          [...first, ...second].some(
            (source) => source.lat === p.lat && source.lng === p.lng,
          ),
        ),
    ).toBe(true);
    expect(
      clipMappingRegion([[outside, { lat: 0, lng: 600 / M }]], {
        lat: 0,
        lng: 0,
      }),
    ).toEqual([]);
    expect(
      clipMappingRegion([[...first.slice(0, 3), ...first.slice(9)]], {
        lat: 0,
        lng: 0,
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { mappedTrack } from "../src/domain/community-tracks";
import { classifyTrackCandidates } from "../src/domain/track-candidates";
const points = [
  { lat: 28, lng: 77 },
  { lat: 28.01, lng: 77 },
];
const way = (id: number, tags: Record<string, string>, nodes?: number[]) =>
  mappedTrack({ id, tags, nodes }, points);
describe("mapped track candidates", () => {
  it("keeps coarse observations separate from mapped class and detects road nodes", () => {
    const paths = [
      way(1, { highway: "cycleway", bicycle: "yes" }, [1, 2]),
      way(2, { highway: "residential" }, [2, 3]),
    ];
    expect(
      classifyTrackCandidates(paths, [{ lat: 28.005, lng: 77 }])[0],
    ).toMatchObject({
      mapClaim: "mapped_cycleway",
      nearbyObservedArea: true,
      topology: "shares_road_nodes",
      sports: ["ride"],
    });
  });
  it("does not turn missing roads or missing node IDs into separation", () => {
    expect(
      classifyTrackCandidates([way(1, { highway: "cycleway" }, [1, 2])], [])[0]
        ?.topology,
    ).toBe("unavailable");
    expect(
      classifyTrackCandidates(
        [
          way(1, { highway: "cycleway" }),
          way(2, { highway: "residential" }, [3, 4]),
        ],
        [],
      )[0]?.topology,
    ).toBe("unavailable");
  });
  it("records bounded topology absence without inferring protection", () => {
    expect(
      classifyTrackCandidates(
        [
          way(1, { highway: "cycleway" }, [1, 2]),
          way(2, { highway: "residential" }, [3, 4]),
        ],
        [],
      )[0],
    ).toMatchObject({
      topology: "no_shared_road_nodes",
      nearbyObservedArea: false,
    });
  });
  it("excludes prohibited, area and provenance-free candidates", () => {
    expect(
      classifyTrackCandidates(
        [
          way(1, { highway: "cycleway", bicycle: "no" }),
          way(2, { highway: "path", area: "yes" }),
          mappedTrack({ tags: { highway: "cycleway" } }, points),
        ],
        [],
      ),
    ).toEqual([]);
  });
  it("distinguishes painted road lanes from cycleways", () => {
    expect(
      classifyTrackCandidates(
        [way(1, { highway: "residential", cycleway: "lane" })],
        [],
      )[0]?.mapClaim,
    ).toBe("mapped_road_lane");
  });
});

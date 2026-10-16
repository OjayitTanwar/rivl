import { describe, expect, it } from "vitest";
import { offlineReroute } from "../src/domain/offline-routing";
import { mappedTrack } from "../src/domain/community-tracks";
const a = { lat: 0, lng: 0 },
  b = { lat: 0, lng: 0.001 },
  c = { lat: 0.001, lng: 0.001 };
function way(
  id: number,
  nodes: number[],
  points = [a, b],
  tags: Record<string, string> = {},
) {
  return mappedTrack(
    {
      id,
      version: 1,
      nodes,
      tags: { highway: "path", foot: "yes", bicycle: "yes", ...tags },
    },
    points,
  );
}
describe("versioned OSM offline topology", () => {
  it("joins shared OSM nodes without inventing coordinate crossings", () => {
    expect(
      offlineReroute([way(1, [1, 2]), way(2, [2, 3], [b, c])], a, c),
    ).not.toBeNull();
    expect(
      offlineReroute([way(1, [1, 2]), way(2, [20, 3], [b, c])], a, c),
    ).toBeNull();
  });
  it("does not join incompatible bridge, tunnel and layer states", () => {
    for (const tags of [
      { bridge: "yes" },
      { tunnel: "yes" },
      { layer: "1" },
    ] as Record<string, string>[]) {
      expect(
        offlineReroute([way(1, [1, 2]), way(2, [2, 3], [b, c], tags)], a, c),
      ).toBeNull();
    }
  });
  it("enforces cycling direction including reverse and bicycle exceptions", () => {
    const forward = way(1, [1, 2], [a, b], { oneway: "yes" });
    expect(offlineReroute([forward], a, b, "ride")).not.toBeNull();
    expect(offlineReroute([forward], b, a, "ride")).toBeNull();
    expect(offlineReroute([forward], b, a, "walk")).not.toBeNull();
    expect(
      offlineReroute(
        [way(1, [1, 2], [a, b], { oneway: "yes", "oneway:bicycle": "no" })],
        b,
        a,
        "ride",
      ),
    ).not.toBeNull();
    const reversed = way(1, [1, 2], [a, b], { oneway: "-1" });
    expect(offlineReroute([reversed], a, b, "ride")).toBeNull();
    expect(offlineReroute([reversed], b, a, "ride")).not.toBeNull();
  });
  it("enforces roundabouts, foot direction, access and conditional restrictions", () => {
    expect(
      offlineReroute(
        [way(1, [1, 2], [a, b], { junction: "roundabout" })],
        b,
        a,
        "ride",
      ),
    ).toBeNull();
    expect(
      offlineReroute([way(1, [1, 2], [a, b], { "oneway:foot": "yes" })], b, a),
    ).toBeNull();
    for (const tags of [
      { foot: "no" },
      { "foot:conditional": "yes @ (sunrise-sunset)" },
      { area: "yes" },
      { "oneway:conditional": "yes @ (Mo-Fr)" },
    ] as Record<string, string>[]) {
      expect(offlineReroute([way(1, [1, 2], [a, b], tags)], a, b)).toBeNull();
    }
  });
  it("rejects missing node metadata and legacy line arrays", () => {
    const missing = way(1, [1, 2]);
    delete missing.nodeIds;
    expect(offlineReroute([missing], a, b)).toBeNull();
    expect(offlineReroute([[a, b]] as never, a, b)).toBeNull();
  });
});

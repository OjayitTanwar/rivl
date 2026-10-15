import type { MappedTrack } from "./community-tracks";
import type { Coordinate, Sport } from "./types";
import { distance } from "./geo";
export type TrackCandidate = {
  wayId: number;
  kind: MappedTrack["kind"];
  sports: Sport[];
  nearbyObservedArea: boolean;
  topology: "shares_road_nodes" | "no_shared_road_nodes" | "unavailable";
  mapClaim:
    | "mapped_cycleway"
    | "mapped_running_track"
    | "mapped_shared_path"
    | "mapped_walking_path"
    | "mapped_trail"
    | "mapped_road_lane";
};
/** Coarse observed cells establish area use only; they cannot identify which parallel way was used. */
export function classifyTrackCandidates(
  features: MappedTrack[],
  observed: Coordinate[],
): TrackCandidate[] {
  const roads = features.filter((f) =>
    ["road", "painted_cycle_lane", "shared_cycle_lane"].includes(f.kind),
  );
  const roadNodes = new Set(roads.flatMap((f) => f.nodeIds ?? []));
  const topologyAvailable =
    roads.length > 0 && roads.every((f) => !!f.nodeIds?.length);
  const seen = new Set<number>();
  const result: TrackCandidate[] = [];
  for (const feature of features.slice(0, 500)) {
    if (
      !feature.wayId ||
      seen.has(feature.wayId) ||
      feature.geometryKind !== "line" ||
      feature.points.length < 2 ||
      feature.kind === "road" ||
      feature.kind === "unknown"
    )
      continue;
    seen.add(feature.wayId);
    const foot =
      feature.footAccess !== "mapped_restricted" &&
      feature.footAccess !== "conditional";
    const bicycle =
      feature.bicycleAccess !== "mapped_restricted" &&
      feature.bicycleAccess !== "conditional";
    const sports: Sport[] = [];
    if (
      bicycle &&
      [
        "cycleway",
        "painted_cycle_lane",
        "shared_cycle_lane",
        "shared_path",
      ].includes(feature.kind)
    )
      sports.push("ride");
    if (
      foot &&
      ["shared_path", "pedestrian_path", "trail", "running_track"].includes(
        feature.kind,
      )
    )
      sports.push("walk", "run");
    if (foot && feature.kind === "trail") sports.push("hike");
    if (!sports.length) continue;
    const mapClaim: TrackCandidate["mapClaim"] =
      feature.kind === "cycleway"
        ? "mapped_cycleway"
        : feature.kind === "running_track"
          ? "mapped_running_track"
          : feature.kind === "shared_path"
            ? "mapped_shared_path"
            : feature.kind === "pedestrian_path"
              ? "mapped_walking_path"
              : feature.kind === "trail"
                ? "mapped_trail"
                : "mapped_road_lane";
    // Every segment is tested, so sparse two-point ways remain discoverable.
    const near = (cell: Coordinate) =>
      feature.points.some((a, index) => {
        const b = feature.points[index + 1];
        if (!b) return distance(a, cell) <= 160;
        const latitude = (cell.lat * Math.PI) / 180,
          scale = Math.cos(latitude);
        const ax = (a.lng - cell.lng) * scale,
          ay = a.lat - cell.lat;
        const bx = (b.lng - cell.lng) * scale,
          by = b.lat - cell.lat;
        const dx = bx - ax,
          dy = by - ay,
          length = dx * dx + dy * dy;
        const t = length
          ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length))
          : 0;
        return Math.hypot(ax + t * dx, ay + t * dy) * 111320 <= 160;
      });
    result.push({
      wayId: feature.wayId,
      kind: feature.kind,
      sports,
      mapClaim,
      nearbyObservedArea: observed.slice(0, 200).some(near),
      topology: feature.nodeIds?.some((n) => roadNodes.has(n))
        ? "shares_road_nodes"
        : topologyAvailable && !!feature.nodeIds?.length
          ? "no_shared_road_nodes"
          : "unavailable",
    });
  }
  return result
    .sort(
      (a, b) =>
        Number(b.nearbyObservedArea) - Number(a.nearbyObservedArea) ||
        a.wayId - b.wayId,
    )
    .slice(0, 100);
}

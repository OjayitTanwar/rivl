export type Coordinate = { lat: number; lng: number };
export type Sport = "run" | "ride" | "walk" | "hike";
export interface Sample extends Coordinate {
  t: number;
  accuracy: number;
  segment: number;
}
export type MappedTrackKind =
  | "cycleway"
  | "painted_cycle_lane"
  | "shared_cycle_lane"
  | "shared_path"
  | "pedestrian_path"
  | "trail"
  | "running_track"
  | "road"
  | "unknown";
export type MappedAccess =
  "mapped_allowed" | "mapped_restricted" | "conditional" | "unknown";
export interface MappedTrack {
  source: "osm";
  wayId?: number;
  version?: number;
  nodeIds?: number[];
  points: Coordinate[];
  tags: Record<string, string>;
  kind: MappedTrackKind;
  footAccess: MappedAccess;
  bicycleAccess: MappedAccess;
  userSegregation: "mapped_segregated" | "mapped_shared" | "unknown";
  motorProtection: "unknown";
  layer: number | null;
  bridge: boolean | null;
  tunnel: boolean | null;
  bicycleDirection: "forward" | "reverse" | "both" | "unknown";
  surface: string | null;
  hikingScale: string | null;
  geometryKind: "line" | "area" | "unknown";
}
export interface PreparedTrackEvidence {
  sourceActivityId: string;
  sourceRevision: number;
  sport: Sport;
  origin: "device-gps" | "watch-gps";
  algorithmVersion: "gps-track-evidence-v1";
  evidenceCategory: "gps_observed_use";
  status: "unverified";
  lines: Coordinate[][];
  acceptedSamples: number;
  rejectedSamples: number;
  eligibleForPublication: false;
}

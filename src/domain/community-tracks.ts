import type { Activity, Coordinate, PrivacyZone, Sample, Sport } from "./types";
import { distance, redactRoute, validSample } from "./geo";

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
const retainedTags = [
  "highway",
  "leisure",
  "area",
  "foot",
  "bicycle",
  "access",
  "vehicle",
  "vehicle:conditional",
  "foot:conditional",
  "bicycle:conditional",
  "access:conditional",
  "fee",
  "segregated",
  "surface",
  "sac_scale",
  "tracktype",
  "smoothness",
  "incline",
  "lit",
  "oneway",
  "oneway:bicycle",
  "layer",
  "bridge",
  "tunnel",
  "cycleway",
  "cycleway:left",
  "cycleway:right",
  "cycleway:both",
  "footway",
  "barrier",
  "crossing",
  "sport",
  "athletics",
];
const restricted =
  /^(no|private|customers|destination|permit|delivery|agricultural|forestry|use_sidepath|dismount|discouraged)$/;
const affirmative = /^(yes|designated|official|permissive)$/;
export function mappedAccess(
  tags: Record<string, string>,
  mode: "foot" | "bicycle",
): MappedAccess {
  const inherited =
    mode === "bicycle" ? (tags.vehicle ?? tags.access) : tags.access;
  const permission = tags[mode] ?? inherited;
  if (
    tags[`${mode}:conditional`] ||
    tags["access:conditional"] ||
    (mode === "bicycle" && tags["vehicle:conditional"]) ||
    tags.fee === "yes"
  )
    return "conditional";
  if (restricted.test(permission ?? "")) return "mapped_restricted";
  if (affirmative.test(permission ?? "")) return "mapped_allowed";
  // Regional implicit access differs; a highway name alone is not permission.
  return "unknown";
}
function direction(value: string | undefined): MappedTrack["bicycleDirection"] {
  return value === "yes" || value === "1"
    ? "forward"
    : value === "-1"
      ? "reverse"
      : value === "no" || value === "0"
        ? "both"
        : "unknown";
}
function booleanTag(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  if (value === "no") return false;
  return /^(yes|viaduct|boardwalk|movable|covered|building_passage|culvert)$/.test(
    value,
  )
    ? true
    : null;
}
/** Preserve map claims and provenance, never upgrade them into observed safety. */
export function mappedTrack(
  way: { id?: unknown; version?: unknown; nodes?: unknown; tags?: unknown },
  points: Coordinate[],
): MappedTrack {
  const raw =
    way.tags && typeof way.tags === "object" && !Array.isArray(way.tags)
      ? (way.tags as Record<string, unknown>)
      : {};
  const tags: Record<string, string> = {};
  for (const key of retainedTags)
    if (typeof raw[key] === "string" && (raw[key] as string).length <= 200)
      tags[key] = raw[key] as string;
  const laneTags = [
    tags.cycleway,
    tags["cycleway:left"],
    tags["cycleway:right"],
    tags["cycleway:both"],
  ];
  const kind: MappedTrackKind =
    tags.highway === "cycleway"
      ? "cycleway"
      : laneTags.some((v) => v === "lane" || v === "opposite_lane")
        ? "painted_cycle_lane"
        : laneTags.some((v) => v === "shared_lane" || v === "share_busway")
          ? "shared_cycle_lane"
          : tags.leisure === "track" &&
              /^(running|athletics)$/.test(tags.sport ?? "")
            ? "running_track"
            : tags.highway === "path" &&
                affirmative.test(tags.foot ?? "") &&
                affirmative.test(tags.bicycle ?? "")
              ? "shared_path"
              : /^(footway|pedestrian|steps)$/.test(tags.highway ?? "")
                ? "pedestrian_path"
                : /^(path|track)$/.test(tags.highway ?? "")
                  ? "trail"
                  : /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)(?:_link)?$/.test(
                        tags.highway ?? "",
                      )
                    ? "road"
                    : "unknown";
  const layer =
    tags.layer !== undefined &&
    /^-?\d+$/.test(tags.layer) &&
    Math.abs(Number(tags.layer)) <= 100
      ? Number(tags.layer)
      : null;
  const positive = (n: unknown): n is number =>
    typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  const nodeIds =
    Array.isArray(way.nodes) &&
    way.nodes.length === points.length &&
    way.nodes.every(positive)
      ? ([...way.nodes] as number[])
      : undefined;
  return {
    source: "osm",
    ...(positive(way.id) ? { wayId: way.id } : {}),
    ...(positive(way.version) ? { version: way.version } : {}),
    ...(nodeIds ? { nodeIds } : {}),
    points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
    tags,
    kind,
    footAccess: mappedAccess(tags, "foot"),
    bicycleAccess: mappedAccess(tags, "bicycle"),
    userSegregation:
      tags.segregated === "yes"
        ? "mapped_segregated"
        : tags.segregated === "no"
          ? "mapped_shared"
          : "unknown",
    motorProtection: "unknown",
    layer,
    bridge: booleanTag(tags.bridge),
    tunnel: booleanTag(tags.tunnel),
    bicycleDirection: direction(tags["oneway:bicycle"] ?? tags.oneway),
    surface: tags.surface ?? null,
    hikingScale: tags.sac_scale ?? null,
    geometryKind:
      tags.area === "yes"
        ? "area"
        : tags.area === "no"
          ? "line"
          : tags.area !== undefined || tags.leisure === "track"
            ? "unknown"
            : "line",
  };
}

export const TRACK_EVIDENCE_POLICY = {
  version: "gps-track-evidence-v1",
  maxSamples: 100_000,
  maxAccuracy: 20,
  maxGapSeconds: 15,
  minLineMeters: 100,
  minLineSamples: 6,
  endpointRadius: 200,
  maxOutputVertices: 20_000,
  maxAbsoluteLatitude: 85,
} as const;
export type TrackOrigin = "device-gps" | "watch-gps" | "import" | "manual";
export interface PreparedTrackEvidence {
  sourceActivityId: string;
  sourceRevision: number;
  sport: Sport;
  origin: "device-gps" | "watch-gps";
  algorithmVersion: typeof TRACK_EVIDENCE_POLICY.version;
  evidenceCategory: "gps_observed_use";
  status: "unverified";
  lines: Coordinate[][];
  acceptedSamples: number;
  rejectedSamples: number;
  // Internal evidence only. No contributor or clock values in a public map.
  eligibleForPublication: false;
}
export type TrackEvidenceResult =
  | { evidence: PreparedTrackEvidence; reason: null }
  | {
      evidence: null;
      reason:
        | "owner"
        | "source"
        | "bounds"
        | "no_usable_geometry"
        | "unsupported_region";
    };
/** Pilot quality thresholds are conservative heuristics, not calibrated confidence.
 * No interpolation or sorting: bad fixes and temporal/source gaps break a line.
 */
export function prepareTrackEvidence(
  activity: Activity,
  samples: Sample[],
  owner: string,
  origin: TrackOrigin,
  zones: PrivacyZone[] = [],
): TrackEvidenceResult {
  const fail = (
    reason: Exclude<TrackEvidenceResult["reason"], null>,
  ): TrackEvidenceResult => ({ evidence: null, reason });
  if (!owner || activity.ownerId !== owner) return fail("owner");
  if (
    activity.demo ||
    activity.simulated ||
    (origin !== "device-gps" && origin !== "watch-gps")
  )
    return fail("source");
  if (
    !Number.isSafeInteger(activity.revision) ||
    activity.revision < 1 ||
    !Number.isFinite(activity.startedAt) ||
    !Number.isFinite(activity.endedAt) ||
    activity.endedAt <= activity.startedAt ||
    !["run", "ride", "walk", "hike"].includes(activity.sport) ||
    samples.length > TRACK_EVIDENCE_POLICY.maxSamples ||
    zones.length > 50 ||
    zones.some(
      (z) =>
        ![z.lat, z.lng, z.radius].every(Number.isFinite) ||
        Math.abs(z.lat) > 90 ||
        Math.abs(z.lng) > 180 ||
        z.radius < 0 ||
        z.radius > 10000,
    )
  )
    return fail("bounds");
  // Planar redaction cannot establish reliable wrap/polar geometry. Decline it
  // until geodesic clipping exists rather than drawing a false cross-world line.
  if (
    samples.some(
      (p, i) =>
        validSample(p) &&
        (Math.abs(p.lat) > TRACK_EVIDENCE_POLICY.maxAbsoluteLatitude ||
          (i > 0 &&
            validSample(samples[i - 1]!) &&
            Math.abs(p.lng - samples[i - 1]!.lng) > 180)),
    )
  )
    return fail("unsupported_region");
  const speeds: Record<Sport, number> = { run: 12, ride: 35, walk: 4, hike: 6 };
  const fragments: Sample[][] = [];
  let line: Sample[] = [],
    previous: Sample | undefined,
    rejected = 0;
  const flush = () => {
    if (line.length > 1) fragments.push(line);
    line = [];
  };
  for (const p of samples) {
    if (
      !validSample(p) ||
      p.accuracy > TRACK_EVIDENCE_POLICY.maxAccuracy ||
      !Number.isSafeInteger(p.segment) ||
      p.segment < 0 ||
      p.t < activity.startedAt ||
      p.t > activity.endedAt
    ) {
      rejected++;
      flush();
      previous = undefined;
      continue;
    }
    if (previous) {
      const seconds = (p.t - previous.t) / 1000;
      if (seconds <= 0) {
        rejected++;
        flush();
        previous = undefined;
        continue;
      }
      if (
        seconds > TRACK_EVIDENCE_POLICY.maxGapSeconds ||
        p.segment !== previous.segment
      )
        flush();
      else if (distance(previous, p) / seconds > speeds[activity.sport]) {
        rejected++;
        flush();
        previous = undefined;
        continue;
      }
    }
    line.push({ ...p });
    previous = p;
  }
  flush();
  if (!fragments.length) return fail("no_usable_geometry");
  // Anchor protection to the actual outing endpoints, not the first accepted fix.
  const first = samples.find((p) => validSample(p)),
    last = [...samples].reverse().find((p) => validSample(p));
  const protectedZones = [
    ...zones,
    ...(first
      ? [
          {
            ...first,
            id: "start",
            label: "Start",
            radius: TRACK_EVIDENCE_POLICY.endpointRadius,
          },
        ]
      : []),
    ...(last
      ? [
          {
            ...last,
            id: "finish",
            label: "Finish",
            radius: TRACK_EVIDENCE_POLICY.endpointRadius,
          },
        ]
      : []),
  ];
  const redacted = fragments.flatMap((fragment) =>
    redactRoute(fragment, protectedZones, 0),
  );
  const useful = redacted.filter(
    (fragment) =>
      fragment.length >= TRACK_EVIDENCE_POLICY.minLineSamples &&
      fragment
        .slice(1)
        .reduce((meters, p, i) => meters + distance(fragment[i]!, p), 0) >=
        TRACK_EVIDENCE_POLICY.minLineMeters,
  );
  const accepted = useful.reduce((n, fragment) => n + fragment.length, 0);
  if (!accepted || accepted > TRACK_EVIDENCE_POLICY.maxOutputVertices)
    return fail("no_usable_geometry");
  return {
    reason: null,
    evidence: {
      sourceActivityId: activity.id,
      sourceRevision: activity.revision,
      sport: activity.sport,
      origin,
      algorithmVersion: TRACK_EVIDENCE_POLICY.version,
      evidenceCategory: "gps_observed_use",
      status: "unverified",
      lines: useful.map((fragment) =>
        fragment.map((p) => ({ lat: p.lat, lng: p.lng })),
      ),
      acceptedSamples: accepted,
      rejectedSamples: rejected,
      eligibleForPublication: false,
    },
  };
}

import type { Activity, Coordinate, PrivacyZone, Sample, Sport } from "./types";
import { distance, redactRoute, validSample } from "./geo";

export {
  mappedTrack,
  mappedAccess,
} from "../../supabase/functions/_shared/mapped-track";
export type {
  MappedTrack,
  MappedTrackKind,
  MappedAccess,
} from "../../supabase/functions/_shared/mapped-track";

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

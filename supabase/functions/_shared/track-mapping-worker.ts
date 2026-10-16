import type {
  Coordinate,
  Sample,
  Sport,
  MappedTrack,
  PreparedTrackEvidence,
} from "./track-types.ts";
import {
  reconstructCommunityTracks,
  TRACK_RECONSTRUCTION_POLICY,
} from "./track-reconstruction.ts";

export interface TrackMappingJob {
  activity_id: string;
  owner_id: string;
  revision: number;
  preference_revision: number;
  lease: string;
}
export interface TrackMappingInput {
  sport: Sport;
  startedAt: number;
  endedAt: number;
  raw: unknown;
  origin: "device-gps" | "watch-gps";
  privacy: { lat: number; lng: number; radius: number }[];
}
export interface TrackSupport {
  wayId: number;
  version: number;
  start: number;
  end: number;
}
export interface TrackMappingPort {
  claim(): Promise<TrackMappingJob | null>;
  input(job: TrackMappingJob): Promise<TrackMappingInput | null>;
  ways(center: Coordinate): Promise<MappedTrack[]>;
  complete(
    job: TrackMappingJob,
    ways: MappedTrack[],
    support: TrackSupport[],
    algorithm: string,
    fingerprint: string | null,
  ): Promise<boolean>;
  retry(job: TrackMappingJob): Promise<void>;
}
async function deadline<T>(work: Promise<T>, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("mapping_deadline")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function mappingFingerprint(
  lines: Coordinate[][],
): Promise<string> {
  const normalized = lines
    .map((line) => {
      const points = line.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
      return [points.join(";"), [...points].reverse().join(";")].sort()[0]!;
    })
    .sort()
    .join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
const rad = Math.PI / 180;
export function trackMeters(a: Coordinate, b: Coordinate) {
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Match PostGIS geometry ST_LineSubstring's degree-arclength parameter,
 * while locating the observed endpoint using the matcher's geodesic metres. */
export function mappingFractionAtMeters(points: Coordinate[], meters: number) {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(
      points[i]!.lat - points[i - 1]!.lat,
      points[i]!.lng - points[i - 1]!.lng,
    );
  if (total <= 0) throw new Error("degenerate_map_way");
  let traveledMeters = 0,
    traveledDegrees = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      edgeMeters = trackMeters(a, b),
      edgeDegrees = Math.hypot(b.lat - a.lat, b.lng - a.lng);
    if (meters <= traveledMeters + edgeMeters)
      return (
        (traveledDegrees +
          edgeDegrees *
            Math.max(
              0,
              Math.min(1, (meters - traveledMeters) / (edgeMeters || 1)),
            )) /
        total
      );
    traveledMeters += edgeMeters;
    traveledDegrees += edgeDegrees;
  }
  return 1;
}
function edgeDistance(p: Coordinate, a: Coordinate, b: Coordinate) {
  const scale = Math.cos(p.lat * rad),
    x = (b.lng - a.lng) * scale,
    y = b.lat - a.lat;
  const fraction = Math.max(
    0,
    Math.min(
      1,
      ((p.lng - a.lng) * scale * x + (p.lat - a.lat) * y) /
        (x * x + y * y || 1),
    ),
  );
  return trackMeters(p, {
    lat: a.lat + fraction * y,
    lng: a.lng + fraction * (b.lng - a.lng),
  });
}
const pointValid = (p: Coordinate) =>
  !!p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 85 &&
  Math.abs(p.lng) <= 180;
/** Trusted-source preparation. Invalid fixes split fragments; no interpolation or
 * joining across excluded endpoints, zones, pauses, clock reversals or GPS gaps. */
export function prepareMappingInput(
  job: TrackMappingJob,
  input: TrackMappingInput,
): PreparedTrackEvidence | null {
  if (
    !input ||
    !["ride", "run", "walk", "hike"].includes(input.sport) ||
    !["device-gps", "watch-gps"].includes(input.origin) ||
    !Number.isFinite(input.startedAt) ||
    !Number.isFinite(input.endedAt) ||
    input.endedAt <= input.startedAt ||
    !Array.isArray(input.raw) ||
    input.raw.length < 6 ||
    input.raw.length > 100000 ||
    !Array.isArray(input.privacy) ||
    input.privacy.length > 50 ||
    input.privacy.some(
      (z) =>
        !pointValid(z) ||
        !Number.isFinite(z.radius) ||
        z.radius < 0 ||
        z.radius > 10000,
    )
  )
    throw new Error("invalid_mapping_input");
  const samples = input.raw as Sample[];
  const valid = (s: Sample) =>
    pointValid(s) &&
    Number.isSafeInteger(s.t) &&
    Number.isFinite(s.accuracy) &&
    s.accuracy >= 0 &&
    Number.isSafeInteger(s.segment) &&
    s.segment >= 0;
  // The source endpoints must themselves be valid, rather than moving protection
  // inward to whichever later fix happens to pass filtering.
  if (!valid(samples[0]!) || !valid(samples[samples.length - 1]!))
    throw new Error("invalid_mapping_endpoints");
  const zones = [
    ...input.privacy,
    { ...samples[0]!, radius: 200 },
    { ...samples[samples.length - 1]!, radius: 200 },
  ];
  const speeds: Record<Sport, number> = { ride: 35, run: 12, walk: 4, hike: 6 };
  const lines: Coordinate[][] = [];
  let line: Coordinate[] = [],
    previous: Sample | undefined,
    rejected = 0,
    vertices = 0;
  const flush = () => {
    const length = line
      .slice(1)
      .reduce((n, p, i) => n + trackMeters(line[i]!, p), 0);
    if (line.length >= 6 && length >= 100) {
      lines.push(line);
      vertices += line.length;
    }
    line = [];
  };
  for (const fix of samples) {
    if (
      !valid(fix) ||
      fix.accuracy > 20 ||
      fix.t < input.startedAt ||
      fix.t > input.endedAt ||
      zones.some((z) => trackMeters(fix, z) <= z.radius)
    ) {
      rejected++;
      flush();
      previous = undefined;
      continue;
    }
    if (previous) {
      const seconds = (fix.t - previous.t) / 1000,
        meters = trackMeters(previous, fix);
      if (
        seconds <= 0 ||
        Math.abs(fix.lng - previous.lng) > 180 ||
        meters / seconds > speeds[input.sport]
      ) {
        rejected++;
        flush();
        previous = undefined;
        continue;
      }
      if (
        seconds > 15 ||
        fix.segment !== previous.segment ||
        zones.some((z) => edgeDistance(z, previous!, fix) <= z.radius)
      )
        flush();
    }
    line.push({ lat: fix.lat, lng: fix.lng });
    previous = fix;
    if (lines.length > 20 || vertices + line.length > 20000)
      throw new Error("mapping_geometry_limit");
  }
  flush();
  if (!lines.length) return null;
  if (lines.length > 20 || vertices > 20000)
    throw new Error("mapping_geometry_limit");
  return {
    sourceActivityId: job.activity_id,
    sourceRevision: job.revision,
    sport: input.sport,
    origin: input.origin,
    algorithmVersion: "gps-track-evidence-v1",
    evidenceCategory: "gps_observed_use",
    status: "unverified",
    lines,
    acceptedSamples: vertices,
    rejectedSamples: rejected,
    eligibleForPublication: false,
  };
}
/** One source and one bounded map region per invocation. Partial geographic
 * coverage never becomes evidence for unseen ways or reconstructed junctions. */
export async function processTrackMapping(
  port: TrackMappingPort,
): Promise<"idle" | "processed" | "stale" | "retry"> {
  const job = await deadline(port.claim());
  if (!job) return "idle";
  try {
    const input = await deadline(port.input(job));
    if (!input) return "stale";
    const evidence = prepareMappingInput(job, input);
    let ways: MappedTrack[] = [],
      support: TrackSupport[] = [];
    if (evidence) {
      const first = evidence.lines[0]!;
      ways = await deadline(port.ways(first[Math.floor(first.length / 2)]!));
      if (
        ways.length > 500 ||
        ways.reduce((n, w) => n + w.points.length, 0) > 12000
      )
        throw new Error("mapping_network_limit");
      const result = reconstructCommunityTracks(
        [
          {
            ownerId: job.owner_id,
            observedDay: new Date(input.startedAt).toISOString().slice(0, 10),
            evidence,
          },
        ],
        ways,
      );
      if (result.incomplete) throw new Error("mapping_complexity_limit");
      support = result.fragments.flatMap((fragment) => {
        const span = fragment.mappedInterval;
        if (fragment.outcome !== "mapped" || !span) return [];
        const way = ways.find(
          (w) => w.wayId === span.wayId && w.version === span.version,
        );
        if (!way) return [];
        // Round inward. The database independently requires support for every
        // published fixed interval, never an entire way from a short observation.
        const start = Math.max(
          0,
          Math.ceil(
            mappingFractionAtMeters(way.points, span.startMeters) * 1000,
          ),
        );
        const end = Math.min(
          1000,
          Math.floor(
            mappingFractionAtMeters(way.points, span.endMeters) * 1000,
          ),
        );
        return start < end
          ? [{ wayId: span.wayId, version: span.version, start, end }]
          : [];
      });
      if (support.length > 128) throw new Error("mapping_support_limit");
    }
    const supportedIds = new Set(
      support.map((span) => `${span.wayId}:${span.version}`),
    );
    ways = ways.filter((way) =>
      supportedIds.has(`${way.wayId}:${way.version}`),
    );
    if (ways.length > 64) throw new Error("mapping_cache_way_limit");
    const fingerprint = evidence
      ? await mappingFingerprint(evidence.lines)
      : null;
    return (await deadline(
      port.complete(
        job,
        ways,
        support,
        TRACK_RECONSTRUCTION_POLICY.version,
        fingerprint,
      ),
    ))
      ? "processed"
      : "stale";
  } catch {
    await deadline(port.retry(job));
    return "retry";
  }
}

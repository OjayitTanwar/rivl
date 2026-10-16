import type {
  Coordinate,
  MappedTrack,
  PreparedTrackEvidence,
} from "./track-types.ts";
const TRACK_EVIDENCE_POLICY = {
  version: "gps-track-evidence-v1",
  minLineSamples: 6,
} as const;
function distance(a: Coordinate, b: Coordinate) {
  const r = Math.PI / 180,
    dy = (b.lat - a.lat) * r,
    dx = (b.lng - a.lng) * r;
  const h =
    Math.sin(dy / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dx / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Bounded private proposals only. These heuristics are not calibrated confidence. */
export const TRACK_RECONSTRUCTION_POLICY = {
  version: "track-reconstruction-v1",
  maxObservations: 100,
  maxWays: 500,
  maxVertices: 20_000,
  maxComparisons: 2_000_000,
  matchMeters: 20,
  ambiguityMeters: 20,
  corridorCellDegrees: 0.0005,
  minOwners: 5,
  minDays: 3,
} as const;
export interface ReconstructionObservation {
  /** Trusted worker metadata, never accepted as client-declared support. */
  ownerId: string;
  observedDay: string;
  evidence: PreparedTrackEvidence;
}
export interface ReconstructedFragment {
  observation: number;
  fragment: number;
  outcome: "mapped" | "ambiguous" | "unmapped";
  wayIds: number[];
  mappedInterval?: {
    wayId: number;
    version: number;
    startMeters: number;
    endMeters: number;
  };
  /** Internal coarse cells; never an ordered public trace. */
  corridorCells?: string[];
}
export interface ReconstructionSupport {
  key: string;
  status: "unverified" | "corroborated";
  /** Internal only: never expose exact support counts or contributor identity. */
  owners: number;
  days: number;
  provenance:
    | { source: "osm"; wayId: number; version?: number; license: "ODbL-1.0" }
    | { source: "gps_observed_use" };
  requiresReview: boolean;
  routingEligible: false;
  publicationEligible: false;
  physicalProtection: "unknown";
  legalAccess: "unknown";
}
export interface TrackReconstruction {
  algorithmVersion: typeof TRACK_RECONSTRUCTION_POLICY.version;
  fragments: ReconstructedFragment[];
  candidates: ReconstructionSupport[];
  rejected: { observation: number; reason: "invalid" | "duplicate_geometry" }[];
  incomplete: boolean;
}
const p = TRACK_RECONSTRUCTION_POLICY;
const valid = (v: Coordinate) =>
  !!v &&
  Number.isFinite(v.lat) &&
  Number.isFinite(v.lng) &&
  Math.abs(v.lat) <= 85 &&
  Math.abs(v.lng) <= 180;
const length = (line: Coordinate[]) =>
  line.slice(1).reduce((n, v, i) => n + distance(line[i]!, v), 0);
function lineValid(line: Coordinate[]) {
  return (
    Array.isArray(line) &&
    line.length >= TRACK_EVIDENCE_POLICY.minLineSamples &&
    line.every(valid) &&
    line.slice(1).every((v, i) => distance(line[i]!, v) <= 250) &&
    length(line) >= 100
  );
}
function dayValid(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(day + "T00:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day
  );
}
function signature(lines: Coordinate[][]) {
  // Exact rounded copies across accounts are suspicious, not independent votes.
  return lines
    .map((line) => {
      const values = line.map((v) => `${v.lat.toFixed(6)},${v.lng.toFixed(6)}`);
      return [values.join(";"), [...values].reverse().join(";")].sort()[0]!;
    })
    .sort()
    .join("|");
}
function cell(v: Coordinate) {
  return `${Math.floor(v.lat / p.corridorCellDegrees)},${Math.floor(v.lng / p.corridorCellDegrees)}`;
}
function segmentDistance(v: Coordinate, a: Coordinate, b: Coordinate) {
  // Local tangent approximation, bounded by accepted geometry and latitude.
  const x = Math.cos((v.lat * Math.PI) / 180) * 111_195;
  const y = 111_195;
  const ax = (a.lng - v.lng) * x,
    ay = (a.lat - v.lat) * y;
  const bx = (b.lng - v.lng) * x,
    by = (b.lat - v.lat) * y;
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function alongWay(point: Coordinate, line: Coordinate[]) {
  let offset = 0,
    nearest = Infinity,
    result = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!,
      b = line[i]!;
    const x = Math.cos((point.lat * Math.PI) / 180) * 111195;
    const ax = (a.lng - point.lng) * x,
      ay = (a.lat - point.lat) * 111195;
    const dx = (b.lng - a.lng) * x,
      dy = (b.lat - a.lat) * 111195;
    const t = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    const error = segmentDistance(point, a, b),
      meters = distance(a, b);
    if (error < nearest) {
      nearest = error;
      result = offset + t * meters;
    }
    offset += meters;
  }
  return result;
}
/** Match complete independent fragments; never infer junctions, access, or protection.
 * Call only after fresh server privacy/source/preference validation. Output stays private.
 * No interpolation, network requests, trace stitching, or automatic publication occurs.
 */
export function reconstructCommunityTracks(
  observations: ReconstructionObservation[],
  ways: MappedTrack[],
): TrackReconstruction {
  const out: TrackReconstruction = {
    algorithmVersion: p.version,
    fragments: [],
    candidates: [],
    rejected: [],
    incomplete: false,
  };
  if (
    !Array.isArray(observations) ||
    !Array.isArray(ways) ||
    observations.length > p.maxObservations ||
    ways.length > p.maxWays
  ) {
    out.incomplete = true;
    return out;
  }
  let vertices = 0;
  for (const way of ways)
    vertices += Array.isArray(way?.points) ? way.points.length : 0;
  for (const observation of observations)
    for (const line of Array.isArray(observation?.evidence?.lines)
      ? observation.evidence.lines
      : [])
      vertices += Array.isArray(line) ? line.length : 0;
  if (vertices > p.maxVertices) {
    out.incomplete = true;
    return out;
  }
  // Retain sparse/unversioned/unknown-kind source lines as ambiguity blockers.
  // Failing endorsement requirements never makes a plausible parallel source disappear.
  const usableWays = ways.filter(
    (w) =>
      !!w &&
      w.source === "osm" &&
      Array.isArray(w.points) &&
      w.points.length >= 2 &&
      w.points.every(valid),
  );
  const bounds = new Map(
    usableWays.map((way) => [
      way,
      {
        minLat: Math.min(...way.points.map((v) => v.lat)),
        maxLat: Math.max(...way.points.map((v) => v.lat)),
        minLng: Math.min(...way.points.map((v) => v.lng)),
        maxLng: Math.max(...way.points.map((v) => v.lng)),
      },
    ]),
  );
  const nearBounds = (point: Coordinate, way: MappedTrack) => {
    const b = bounds.get(way)!;
    // Same local tangent metric as segmentDistance: any segment within 40m
    // must intersect this inclusive inflated bounding box. Unknown metadata
    // and sparse geometry use exactly the same filter as endorsable ways.
    const latitudeMargin = (p.matchMeters + p.ambiguityMeters) / 111195 + 1e-10;
    const longitudeMargin =
      latitudeMargin / Math.cos((point.lat * Math.PI) / 180);
    return (
      point.lat >= b.minLat - latitudeMargin &&
      point.lat <= b.maxLat + latitudeMargin &&
      point.lng >= b.minLng - longitudeMargin &&
      point.lng <= b.maxLng + longitudeMargin
    );
  };
  const endorsable = (w: MappedTrack) =>
    Number.isSafeInteger(w.wayId) &&
    w.wayId! > 0 &&
    Number.isSafeInteger(w.version) &&
    w.version! > 0 &&
    w.geometryKind === "line" &&
    w.points.slice(1).every((v, i) => distance(w.points[i]!, v) <= 250);
  // Conflicting retained revisions for a way cannot establish a unique match.
  const repeatedIds = new Set(
    usableWays
      .filter((w, i, all) => all.findIndex((v) => v.wayId === w.wayId) !== i)
      .map((w) => w.wayId),
  );
  const validObservations = observations.map(
    (o) =>
      !!o &&
      typeof o.ownerId === "string" &&
      o.ownerId.length > 0 &&
      dayValid(o.observedDay) &&
      o.evidence?.algorithmVersion === TRACK_EVIDENCE_POLICY.version &&
      (o.evidence.origin === "device-gps" ||
        o.evidence.origin === "watch-gps") &&
      ["ride", "run", "walk", "hike"].includes(o.evidence.sport) &&
      Array.isArray(o.evidence.lines) &&
      o.evidence.lines.length > 0 &&
      o.evidence.lines.length <= 20 &&
      o.evidence.lines.every(lineValid),
  );
  const signatures = observations.map((o, i) =>
    validObservations[i]
      ? o.evidence.lines.map((line) => signature([line]))
      : [],
  );
  const groups = new Map<
    string,
    {
      owners: Set<string>;
      days: Map<string, string>;
      provenance: ReconstructionSupport["provenance"];
    }
  >();
  let comparisons = 0;
  for (let oi = 0; oi < observations.length; oi++) {
    const o = observations[oi]!;
    if (!validObservations[oi]) {
      out.rejected.push({ observation: oi, reason: "invalid" });
      continue;
    }
    if (
      observations.some(
        (other, j) =>
          j !== oi &&
          validObservations[j] &&
          other.ownerId !== o.ownerId &&
          signatures[j]!.some((value) => signatures[oi]!.includes(value)),
      )
    ) {
      out.rejected.push({ observation: oi, reason: "duplicate_geometry" });
      continue;
    }
    for (let fi = 0; fi < o.evidence.lines.length; fi++) {
      // Resolve contiguous per-way runs first. Ambiguous fixes are separators,
      // never a connector between way geometries or across a privacy fragment.
      const runs: { line: Coordinate[]; assignment: string }[] = [];
      let run: Coordinate[] = [],
        previousAssignment: string | undefined;
      for (const point of o.evidence.lines[fi]!) {
        const nearby: { id: number; error: number }[] = [];
        for (const way of usableWays) {
          if (!nearBounds(point, way)) continue;
          let nearest = Infinity;
          for (let j = 1; j < way.points.length; j++) {
            if (++comparisons > p.maxComparisons) {
              out.incomplete = true;
              out.candidates = [];
              return out;
            }
            nearest = Math.min(
              nearest,
              segmentDistance(point, way.points[j - 1]!, way.points[j]!),
            );
          }
          if (nearest <= p.matchMeters + p.ambiguityMeters)
            nearby.push({ id: way.wayId!, error: nearest });
        }
        nearby.sort((a, b) => a.error - b.error || a.id - b.id);
        const bestPoint = nearby[0];
        const pointAlternatives =
          bestPoint && bestPoint.error <= p.matchMeters
            ? nearby.filter(
                (v) => v.error <= bestPoint.error + p.ambiguityMeters,
              )
            : [];
        const assignment =
          pointAlternatives.length === 1 && !repeatedIds.has(bestPoint!.id)
            ? `way:${bestPoint!.id}`
            : nearby.length
              ? "ambiguous"
              : "unmapped";
        if (
          previousAssignment !== undefined &&
          assignment !== previousAssignment
        ) {
          runs.push({ line: run, assignment: previousAssignment! });
          run = [];
        }
        run.push(point);
        previousAssignment = assignment;
      }
      if (run.length) runs.push({ line: run, assignment: previousAssignment! });
      for (const { line, assignment } of runs) {
        const matches: { way: MappedTrack; error: number }[] = [];
        for (const way of usableWays) {
          let error = 0;
          for (const point of line) {
            if (!nearBounds(point, way)) {
              error = Infinity;
              break;
            }
            let nearest = Infinity;
            for (let j = 1; j < way.points.length; j++) {
              if (++comparisons > p.maxComparisons) {
                out.incomplete = true;
                out.candidates = [];
                return out;
              }
              nearest = Math.min(
                nearest,
                segmentDistance(point, way.points[j - 1]!, way.points[j]!),
              );
            }
            error = Math.max(error, nearest);
            if (error > p.matchMeters + p.ambiguityMeters) break;
          }
          if (error <= p.matchMeters + p.ambiguityMeters)
            matches.push({ way, error });
        }
        matches.sort(
          (a, b) => a.error - b.error || a.way.wayId! - b.way.wayId!,
        );
        const best = matches[0];
        const alternatives =
          best && best.error <= p.matchMeters
            ? matches.filter((m) => m.error <= best.error + p.ambiguityMeters)
            : [];
        let keys: string[] = [];
        let provenance: ReconstructionSupport["provenance"] = {
          source: "gps_observed_use",
        };
        const offsets = best
          ? line.map((point) => alongWay(point, best.way.points))
          : [];
        const continuous = offsets
          .slice(1)
          .every(
            (offset, i) =>
              Math.abs(offset - offsets[i]!) <=
              distance(line[i]!, line[i + 1]!) + 40,
          );
        if (
          lineValid(line) &&
          assignment === `way:${best?.way.wayId}` &&
          continuous &&
          best &&
          endorsable(best.way) &&
          alternatives.length === 1 &&
          !repeatedIds.has(best.way.wayId)
        ) {
          out.fragments.push({
            observation: oi,
            fragment: fi,
            outcome: "mapped",
            wayIds: [best.way.wayId!],
          });
          const startMeters = Math.min(...offsets),
            endMeters = Math.max(...offsets);
          out.fragments[out.fragments.length - 1]!.mappedInterval = {
            wayId: best.way.wayId!,
            version: best.way.version!,
            startMeters,
            endMeters,
          };
          for (
            let bin = Math.ceil(startMeters / 50);
            (bin + 1) * 50 <= endMeters;
            bin++
          )
            keys.push(`osm:${best.way.wayId}:${best.way.version}:${bin}`);
          provenance = {
            source: "osm",
            wayId: best.way.wayId!,
            version: best.way.version,
            license: "ODbL-1.0",
          };
        } else if (matches.length) {
          out.fragments.push({
            observation: oi,
            fragment: fi,
            outcome: "ambiguous",
            wayIds: matches
              .map((m) => m.way.wayId!)
              .filter((id) => Number.isSafeInteger(id) && id > 0),
          });
        } else {
          const cells = [...new Set(line.map(cell))].sort();
          out.fragments.push({
            observation: oi,
            fragment: fi,
            outcome: "unmapped",
            wayIds: [],
            corridorCells: cells,
          });
          // Exact coarse footprint grouping is deliberately conservative: never joins adjacent corridors.
          if (lineValid(line)) keys = [`corridor:${cells.join(";")}`];
        }
        for (const key of keys) {
          const group = groups.get(key) ?? {
            owners: new Set<string>(),
            days: new Map<string, string>(),
            provenance,
          };
          group.owners.add(o.ownerId);
          group.days.set(
            o.ownerId,
            [
              group.days.get(o.ownerId) ?? o.observedDay,
              o.observedDay,
            ].sort()[0]!,
          );
          groups.set(key, group);
        }
      }
    }
  }
  out.candidates = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({
      key,
      status:
        g.owners.size >= p.minOwners &&
        new Set(g.days.values()).size >= p.minDays
          ? "corroborated"
          : "unverified",
      owners: g.owners.size,
      days: new Set(g.days.values()).size,
      provenance: g.provenance,
      requiresReview: true,
      routingEligible: false,
      publicationEligible: false,
      physicalProtection: "unknown",
      legalAccess: "unknown",
    }));
  return out;
}

import type { Coordinate, Sport } from "./track-types.ts";
import type { ReconstructionObservation } from "./track-reconstruction.ts";

/** Private geometric hypotheses, never routing edges or evidence of legal access.
 * Caller must revalidate consent/source/privacy and exclude mapped/ambiguous fixes.
 * Strict bounds intentionally prefer missing a path over joining unrelated paths.
 */
export const UNMAPPED_RECONSTRUCTION_POLICY = {
  version: "unmapped-centerline-v1",
  maxObservations: 100,
  maxVertices: 20000,
  maxComparisons: 2000000,
  stationMeters: 10,
  corridorMeters: 6,
  minOwners: 5,
  minDays: 3,
  minLengthMeters: 100,
  maxEdgeMeters: 50,
} as const;
export interface UnmappedTrackCandidate {
  geometry: Coordinate[];
  widthMeters: number;
  owners: number;
  days: number;
  sport: Sport;
  support: { observation: number; fragment: number }[];
  status: "proposed";
  provenance: { source: "gps_observed_use" };
  requiresReview: true;
  routingEligible: false;
  publicationEligible: false;
  legalAccess: "unknown";
  physicalProtection: "unknown";
  topology: "unknown";
}
export interface UnmappedTrackReconstruction {
  algorithmVersion: typeof UNMAPPED_RECONSTRUCTION_POLICY.version;
  candidates: UnmappedTrackCandidate[];
  rejected: {
    observation: number;
    fragment?: number;
    reason: "invalid" | "duplicate_geometry";
  }[];
  incomplete: boolean;
}
type XY = { x: number; y: number };
const p = UNMAPPED_RECONSTRUCTION_POLICY;
const meters = 111195;
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (a: number[]) => {
  const s = [...a].sort((a, b) => a - b);
  return (
    (s[Math.floor((s.length - 1) / 2)]! + s[Math.ceil((s.length - 1) / 2)]!) / 2
  );
};
const valid = (v: Coordinate) =>
  !!v &&
  Number.isFinite(v.lat) &&
  Number.isFinite(v.lng) &&
  Math.abs(v.lat) <= 85 &&
  Math.abs(v.lng) <= 180;
function dayValid(day: string) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(day + "T00:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === day;
}
function sample(line: XY[], step: number) {
  const out: XY[] = [line[0]!];
  let next = step,
    offset = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!,
      b = line[i]!,
      d = dist(a, b);
    while (next <= offset + d) {
      const t = (next - offset) / (d || 1);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      next += step;
    }
    offset += d;
  }
  return out;
}
/** Resampling removes direction and sample-rate from duplicate signatures. */
function signature(line: XY[]) {
  const endpoint = (v: XY) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`;
  const ordered =
    endpoint(line[0]!) < endpoint(line[line.length - 1]!)
      ? line
      : [...line].reverse();
  return sample(ordered, 10)
    .map((v) => `${Math.round(v.x * 5)},${Math.round(v.y * 5)}`)
    .join(";");
}
export function reconstructUnmappedTracks(
  observations: ReconstructionObservation[],
): UnmappedTrackReconstruction {
  const out: UnmappedTrackReconstruction = {
    algorithmVersion: p.version,
    candidates: [],
    rejected: [],
    incomplete: false,
  };
  if (!Array.isArray(observations) || observations.length > p.maxObservations) {
    out.incomplete = true;
    return out;
  }
  let count = 0;
  for (const o of observations)
    for (const l of Array.isArray(o?.evidence?.lines) ? o.evidence.lines : []) {
      count += Array.isArray(l) ? l.length : 0;
      if (count > p.maxVertices) {
        out.incomplete = true;
        return out;
      }
    }
  // A single local projection is safe only within this bounded 20km window.
  const origin = observations
    .flatMap((o) => (Array.isArray(o?.evidence?.lines) ? o.evidence.lines : []))
    .flatMap((l) => (Array.isArray(l) ? l : []))
    .filter(valid)
    .sort((a, b) => a.lat - b.lat || a.lng - b.lng)[0];
  if (!origin) return out;
  const scale = Math.cos((origin.lat * Math.PI) / 180) * meters;
  const xy = (v: Coordinate): XY => ({
    x: (v.lng - origin.lng) * scale,
    y: (v.lat - origin.lat) * meters,
  });
  const coordinate = (v: XY): Coordinate => ({
    lat: origin.lat + v.y / meters,
    lng: origin.lng + v.x / scale,
  });
  const fragments: {
    oi: number;
    fi: number;
    owner: string;
    day: string;
    sport: Sport;
    line: XY[];
    signature: string;
    length: number;
  }[] = [];
  observations.forEach((o, oi) => {
    if (
      !o ||
      typeof o.ownerId !== "string" ||
      !o.ownerId.trim() ||
      !dayValid(o.observedDay) ||
      o.evidence?.algorithmVersion !== "gps-track-evidence-v1" ||
      !["device-gps", "watch-gps"].includes(o.evidence.origin) ||
      !["run", "ride", "walk", "hike"].includes(o.evidence.sport) ||
      !Array.isArray(o.evidence.lines) ||
      o.evidence.lines.length > 20 ||
      !o.evidence.lines.length
    ) {
      out.rejected.push({ observation: oi, reason: "invalid" });
      return;
    }
    o.evidence.lines.forEach((l, fi) => {
      if (!Array.isArray(l) || l.length < 6 || !l.every(valid)) {
        out.rejected.push({ observation: oi, fragment: fi, reason: "invalid" });
        return;
      }
      let line = l.map(xy);
      const edges = line.slice(1).map((v, i) => dist(v, line[i]!));
      const length = edges.reduce((a, b) => a + b, 0);
      if (
        edges.some((d) => d > p.maxEdgeMeters) ||
        length < p.minLengthMeters ||
        line.some((v) => Math.hypot(v.x, v.y) > 20000) ||
        length > 10000
      ) {
        out.rejected.push({ observation: oi, fragment: fi, reason: "invalid" });
        return;
      }
      const first = line[0]!,
        last = line[line.length - 1]!;
      if (first.x > last.x || (first.x === last.x && first.y > last.y))
        line = [...line].reverse();
      fragments.push({
        oi,
        fi,
        owner: o.ownerId,
        day: o.observedDay,
        sport: o.evidence.sport,
        line,
        signature: signature(line),
        length,
      });
    });
  });
  const unique = fragments
    .filter((f) => {
      if (
        fragments.some(
          (g) => g.owner !== f.owner && g.signature === f.signature,
        )
      ) {
        out.rejected.push({
          observation: f.oi,
          fragment: f.fi,
          reason: "duplicate_geometry",
        });
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        b.length - a.length ||
        a.signature.localeCompare(b.signature) ||
        a.owner.localeCompare(b.owner) ||
        a.day.localeCompare(b.day),
    );
  let comparisons = 0;
  const budget = () => {
    if (++comparisons > p.maxComparisons) throw new Error("budget");
  };
  const hypotheses: UnmappedTrackCandidate[] = [];
  try {
    for (const anchor of unique) {
      let run: { point: XY; width: number; support: typeof unique }[] = [];
      const flush = () => {
        if (run.length >= 11) {
          const geometry = run.map((s) => coordinate(s.point));
          const support = run[0]!.support.filter((f) =>
            run.every((s) =>
              s.support.some((g) => g.oi === f.oi && g.fi === f.fi),
            ),
          );
          if (
            new Set(support.map((f) => f.owner)).size < 5 ||
            new Set(support.map((f) => f.day)).size < 3
          ) {
            run = [];
            return;
          }
          hypotheses.push({
            geometry,
            widthMeters: Math.max(...run.map((s) => s.width)),
            owners: new Set(support.map((f) => f.owner)).size,
            days: new Set(support.map((f) => f.day)).size,
            sport: anchor.sport,
            support: support.map((f) => ({
              observation: f.oi,
              fragment: f.fi,
            })),
            status: "proposed",
            provenance: { source: "gps_observed_use" },
            requiresReview: true,
            routingEligible: false,
            publicationEligible: false,
            legalAccess: "unknown",
            physicalProtection: "unknown",
            topology: "unknown",
          });
        }
        run = [];
      };
      const stations = sample(anchor.line, p.stationMeters);
      for (let si = 0; si < stations.length; si++) {
        const station = stations[si]!,
          before = stations[Math.max(0, si - 1)]!,
          after = stations[Math.min(stations.length - 1, si + 1)]!;
        const dx = after.x - before.x,
          dy = after.y - before.y,
          norm = Math.hypot(dx, dy);
        if (norm < 1) {
          flush();
          continue;
        }
        const hits: { f: typeof anchor; point: XY; offset: number }[] = [];
        for (const f of unique) {
          if (f.sport !== anchor.sport) continue;
          let best: { point: XY; error: number; offset: number } | undefined;
          const near: { point: XY; index: number }[] = [];
          for (let j = 1; j < f.line.length; j++) {
            budget();
            const a = f.line[j - 1]!,
              b = f.line[j]!,
              ex = b.x - a.x,
              ey = b.y - a.y,
              len = Math.hypot(ex, ey);
            if (len < 0.1) continue;
            // Ignore opposing/crossing branches; endpoint clamping cannot extend a tail.
            if (Math.abs((ex * dx + ey * dy) / (len * norm)) < 0.9) continue;
            const t =
              ((station.x - a.x) * ex + (station.y - a.y) * ey) / (len * len);
            if (t < 0 || t > 1) continue;
            const point = { x: a.x + t * ex, y: a.y + t * ey },
              error = dist(station, point);
            if (error <= p.corridorMeters) {
              near.push({ point, index: j });
              if (!best || error < best.error)
                best = {
                  point,
                  error,
                  offset:
                    ((point.x - station.x) * -dy + (point.y - station.y) * dx) /
                    norm,
                };
            }
          }
          // A loop returning to the same station is ambiguous even on the same fragment.
          if (
            best &&
            !near.some((a, i) =>
              near
                .slice(i + 1)
                .some(
                  (b) =>
                    Math.abs(a.index - b.index) > 2 &&
                    dist(a.point, b.point) > 2,
                ),
            )
          )
            hits.push({ f, point: best.point, offset: best.offset });
        }
        // One owner contributes at most one fix/day at a station, deterministic earliest day.
        hits.sort(
          (a, b) =>
            a.f.day.localeCompare(b.f.day) ||
            a.f.signature.localeCompare(b.f.signature),
        );
        const owners = [
          ...new Map(
            hits
              .slice()
              .reverse()
              .map((h) => [h.f.owner, h]),
          ).values(),
        ];
        const offsets = owners.map((h) => h.offset).sort((a, b) => a - b);
        const bimodal = offsets.some(
          (v, i) => i >= 1 && i < offsets.length - 2 && offsets[i + 1]! - v > 2,
        );
        if (
          owners.length < p.minOwners ||
          new Set(owners.map((h) => h.f.day)).size < p.minDays ||
          bimodal ||
          offsets.at(-1)! - offsets[0]! > 6
        ) {
          flush();
          continue;
        }
        const center = median(offsets),
          point = {
            x: station.x - (center * dy) / norm,
            y: station.y + (center * dx) / norm,
          };
        if (run.length) {
          const previous = run.at(-1)!;
          const common = owners.filter((h) =>
            run.every((station) =>
              station.support.some((f) => f.oi === h.f.oi && f.fi === h.f.fi),
            ),
          );
          // Every edge needs the same independent fragments on both sides; never
          // connect adjacent privacy fragments merely because their owners agree.
          if (
            dist(previous.point, point) > 15 ||
            common.length < p.minOwners ||
            new Set(common.map((h) => h.f.day)).size < p.minDays
          )
            flush();
        }
        run.push({
          point,
          width: Math.max(
            0.5,
            2 * median(offsets.map((v) => Math.abs(v - center))),
          ),
          support: owners.map((h) => h.f),
        });
      }
      flush();
    }
  } catch {
    out.incomplete = true;
    return out;
  }
  // Repeated anchors can describe the same supported interval; keep the longest.
  hypotheses.sort(
    (a, b) =>
      b.geometry.length - a.geometry.length ||
      JSON.stringify(a.geometry).localeCompare(JSON.stringify(b.geometry)),
  );
  for (const h of hypotheses) {
    const key = h.support
      .map((s) => `${s.observation}:${s.fragment}`)
      .sort()
      .join("|");
    // Separate runs from identical fragments remain separate when spatially disjoint.
    const middle = xy(h.geometry[Math.floor(h.geometry.length / 2)]!);
    const duplicate = out.candidates.some(
      (c) =>
        c.sport === h.sport &&
        c.support
          .map((s) => `${s.observation}:${s.fragment}`)
          .sort()
          .join("|") === key &&
        c.geometry.some((v) => dist(xy(v), middle) < 20),
    );
    if (!duplicate) out.candidates.push(h);
  }
  return out;
}

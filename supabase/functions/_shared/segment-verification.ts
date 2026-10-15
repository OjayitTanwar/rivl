/** Shared server algorithm. Passing these GPS checks is not proof against GPS spoofing. */
export const SEGMENT_ALGORITHM = "gps-corridor-v1";
export type Fix = { lat: number; lng: number; t: number; accuracy: number; segment: number };
export type SegmentPath = { id: string; revision: number; sport: string; points: { lat: number; lng: number }[] };
export type PrivacyArea = { lat: number; lng: number; radius: number };
export type MatchedEffort = { segment_id: string; segment_revision: number; seconds: number; start_ms: number; end_ms: number; quality: { fixes: number; max_accuracy: number; max_gap: number } };
const rad = Math.PI / 180;
function meters(a: {lat: number; lng: number}, b: {lat: number; lng: number}) {
  const dlat = (b.lat - a.lat) * rad, dlng = (b.lng - a.lng) * rad;
  const s = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function decodeTrack(raw: unknown): Fix[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 300_000) throw new Error("invalid_track");
  let lat = 0, lng = 0, t = 0;
  return raw.map((row: unknown) => {
    if (!Array.isArray(row) || row.length < 8 || !row.every(Number.isFinite)) throw new Error("invalid_track");
    lat += row[0]; lng += row[1]; t += row[2];
    const fix = { lat: lat / 1e7, lng: lng / 1e7, t, accuracy: row[4] / 10, segment: row[7] };
    if (Math.abs(fix.lat) > 85 || Math.abs(fix.lng) > 180 || !Number.isSafeInteger(t) || fix.accuracy < 0 || !Number.isInteger(fix.segment) || fix.segment < 0) throw new Error("invalid_track");
    return fix;
  });
}
function project(path: SegmentPath["points"], lengths: number[], fix: Fix) {
  let best = { along: 0, offset: Infinity };
  const scale = Math.cos(fix.lat * rad);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const x = (b.lng - a.lng) * scale, y = b.lat - a.lat;
    const raw = ((fix.lng - a.lng) * scale * x + (fix.lat - a.lat) * y) / (x * x + y * y || 1);
    const fraction = Math.max(0, Math.min(1, raw));
    const offset = meters(fix, { lat: a.lat + fraction * y, lng: a.lng + fraction * (b.lng - a.lng) });
    const extension = i === 1 && raw < 0 || i === path.length - 1 && raw > 1;
    const along = lengths[i - 1]! + (extension ? raw : fraction) * (lengths[i]! - lengths[i - 1]!);
    if (offset < best.offset) best = { along, offset };
  }
  return best;
}
export function verifySegment(fixes: Fix[], segment: SegmentPath, privacy: PrivacyArea[] = [], budget = {remaining: 5_000_000}): MatchedEffort | null {
  if (fixes.length < 3 || segment.points.length < 2 || segment.points.length > 5000) return null;
  if (segment.points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 85 || Math.abs(p.lng) > 180)) return null;
  const lengths = [0];
  for (let i = 1; i < segment.points.length; i++) lengths.push(lengths[i - 1]! + meters(segment.points[i - 1]!, segment.points[i]!));
  const length = lengths.at(-1)!;
  if (length < 50 || length > 50_000) return null;
  const speedLimit = segment.sport === "ride" ? 30 : segment.sport === "run" ? 10 : segment.sport === "walk" ? 4 : 7;
  const box = segment.points.reduce((bounds,p) => ({south:Math.min(bounds.south,p.lat),north:Math.max(bounds.north,p.lat),west:Math.min(bounds.west,p.lng),east:Math.max(bounds.east,p.lng)}),{south:Infinity,north:-Infinity,west:Infinity,east:-Infinity});
  const marginLat = 100 / 111_000, marginLng = marginLat / Math.max(.05,Math.cos((box.south+box.north)/2*rad));
  const projectionAt = (fix: Fix) => { budget.remaining -= segment.points.length; if (budget.remaining < 0) throw new Error("verification_complexity_limit"); return project(segment.points,lengths,fix); };
  const protectedAreas = [...privacy, {...fixes[0]!, radius: 200}, {...fixes.at(-1)!, radius: 200}];
  let previous: { fix: Fix; along: number } | null = null;
  let active: { start: number; fixes: number; maxAccuracy: number; maxGap: number } | null = null;
  let best: MatchedEffort | null = null;
  for (const fix of fixes) {
    if (fix.lat < box.south-marginLat || fix.lat>box.north+marginLat || fix.lng<box.west-marginLng || fix.lng>box.east+marginLng) { active=null; previous=null; continue; }
    const projection = projectionAt(fix);
    const dt = previous ? (fix.t - previous.fix.t) / 1000 : 0;
    const bad = !Number.isFinite(fix.accuracy) || fix.accuracy > 25 || fix.accuracy < 0 || !Number.isFinite(fix.t) ||
      projection.offset > 30 || protectedAreas.some(area => meters(fix, area) < area.radius) ||
      previous && (fix.segment !== previous.fix.segment || dt <= 0 || dt > 15 || meters(fix, previous.fix) / dt > speedLimit || projection.along < previous.along - 12);
    if (bad) { active = null; previous = null; continue; }
    // Sample chords as well: sparse fixes must not cut across a bend or a privacy zone.
    if (active && previous) {
      const span = meters(fix, previous.fix);
      let shortcut = false;
      for (let fraction = 10 / Math.max(10, span); fraction < 1; fraction += 10 / Math.max(10, span)) {
        const mid = {...fix, lat: previous.fix.lat + (fix.lat - previous.fix.lat) * fraction, lng: previous.fix.lng + (fix.lng - previous.fix.lng) * fraction};
        if (projectionAt(mid).offset > 30 || protectedAreas.some(area => meters(mid, area) < area.radius)) { shortcut = true; break; }
      }
      if (shortcut) { active = null; previous = null; continue; }
    }
    if (!active) {
      if (previous && previous.along <= 0 && projection.along >= 0 && projection.along <= 100) {
        const fraction = -previous.along / (projection.along - previous.along || 1);
        active = { start: previous.fix.t + fraction * (fix.t - previous.fix.t), fixes: 2, maxAccuracy: Math.max(previous.fix.accuracy, fix.accuracy), maxGap: dt };
      } else if (!previous && Math.abs(projection.along) <= 5) {
        active = { start: fix.t, fixes: 1, maxAccuracy: fix.accuracy, maxGap: 0 };
      }
    } else {
      active.fixes++; active.maxAccuracy = Math.max(active.maxAccuracy, fix.accuracy); active.maxGap = Math.max(active.maxGap, dt);
      if (previous && previous.along < length && projection.along >= length) {
        const fraction = (length - previous.along) / (projection.along - previous.along || 1);
        const end = previous.fix.t + fraction * (fix.t - previous.fix.t);
        const seconds = (end - active.start) / 1000;
        if (seconds >= 5 && active.fixes >= 3 && length / seconds <= speedLimit) {
          const effort = { segment_id: segment.id, segment_revision: segment.revision, seconds, start_ms: Math.round(active.start), end_ms: Math.round(end), quality: { fixes: active.fixes, max_accuracy: active.maxAccuracy, max_gap: active.maxGap } };
          if (!best || effort.seconds < best.seconds) best = effort;
        }
        active = null;
      }
    }
    previous = { fix, along: projection.along };
  }
  return best;
}
export interface SegmentJob { activity_id: string; owner_id: string; revision: number; lease: string }
export interface SegmentInput { sport: string; public: boolean; optedIn: boolean; raw: unknown; segments: SegmentPath[]; privacy: PrivacyArea[] }
export interface SegmentPort {
  claim(): Promise<SegmentJob | null>;
  input(job: SegmentJob): Promise<SegmentInput | null>;
  complete(job: SegmentJob, efforts: MatchedEffort[], algorithm: string): Promise<boolean>;
  retry(job: SegmentJob): Promise<void>;
}
export async function processSegments(port: SegmentPort): Promise<"idle" | "processed" | "stale" | "retry"> {
  const job = await port.claim();
  if (!job) return "idle";
  try {
    const input = await port.input(job);
    if (!input) return "stale";
    let efforts: MatchedEffort[] = [];
    if (input.public && input.optedIn) {
      if (input.segments.length > 200) throw new Error("candidate_limit");
      const fixes = decodeTrack(input.raw);
      const budget = {remaining:25_000_000};
      efforts = input.segments.filter(s => s.sport === input.sport).flatMap(s => {
        const effort = verifySegment(fixes, s, input.privacy,budget);
        return effort ? [effort] : [];
      });
    }
    return await port.complete(job, efforts, SEGMENT_ALGORITHM) ? "processed" : "stale";
  } catch { await port.retry(job); return "retry"; }
}

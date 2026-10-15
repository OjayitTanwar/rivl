import type { Sample } from "./types";

export interface ReplayTimeline {
  offsets: number[];
  recordedMs: number;
  timed: boolean;
}

// Preserve recorded pauses and speed changes. Planned routes have no useful
// timestamps, so their preview advances evenly along the geometry.
export function replayTimeline(points: Sample[], recorded = true): ReplayTimeline {
  const first = points[0]?.t ?? 0;
  const last = points.at(-1)?.t ?? first;
  const timed =
    recorded &&
    points.length > 1 &&
    Number.isFinite(first) &&
    Number.isFinite(last) &&
    last - first >= 1000 &&
    points.every((point, index) =>
      Number.isFinite(point.t) &&
      (index === 0 || point.t >= points[index - 1]!.t),
    );
  const recordedMs = timed ? last - first : 0;
  return {
    offsets: points.map((point, index) =>
      timed
        ? (point.t - first) / recordedMs
        : points.length > 1
          ? index / (points.length - 1)
          : 0,
    ),
    recordedMs,
    timed,
  };
}

export function replayIndexAt(timeline: ReplayTimeline, fraction: number): number {
  const offsets = timeline.offsets;
  if (!offsets.length) return -1;
  const target = Math.max(0, Math.min(1, fraction));
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (offsets[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

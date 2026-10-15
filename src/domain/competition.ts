import type { Segment, SegmentEffort, Sample, Activity } from "./types";
import { distance } from "./geo";
export type Ranking =
  "overall" | "friends" | "age" | "weekly" | "improved" | "handicap";
export function rankEfforts(
  efforts: SegmentEffort[],
  kind: Ranking,
  now = Date.now(),
  age = 30,
) {
  const filtered = efforts.filter(
    (e) =>
      e.seconds > 0 &&
      (kind !== "friends" || e.friend) &&
      (kind !== "age" ||
        (e.age !== null && Math.floor(e.age / 10) === Math.floor(age / 10))) &&
      (kind !== "weekly" || e.date >= now - 7 * 86400000) &&
      (kind !== "improved" || e.previous !== null) &&
      (kind !== "handicap" || e.expected !== null),
  );
  const score = (e: SegmentEffort) =>
    kind === "improved"
      ? -(1 - e.seconds / e.previous!)
      : kind === "handicap"
        ? e.seconds / e.expected!
        : e.seconds;
  return [...filtered]
    .sort((a, b) => score(a) - score(b))
    .filter(
      (e, i, all) => all.findIndex((x) => x.athleteId === e.athleteId) === i,
    );
}
export function matchSegment(
  samples: Sample[],
  segment: Segment,
): { seconds: number; start: number; end: number } | null {
  if (segment.points.length < 2) return null;
  let start = -1,
    checkpoint = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    if (start >= 0 && p.segment !== samples[start]!.segment) {
      start = -1;
      checkpoint = 0;
    }
    if (distance(p, segment.points[checkpoint]!) <= 25) {
      if (checkpoint === 0) start = i;
      checkpoint++;
      if (checkpoint === segment.points.length && start >= 0)
        return { seconds: (p.t - samples[start]!.t) / 1000, start, end: i };
    }
  }
  return null;
}
export function ghostDelta(
  meters: number,
  seconds: number,
  ghost: Activity,
): number | null {
  return ghost.summary.distance && ghost.summary.moving
    ? seconds - meters / (ghost.summary.distance / ghost.summary.moving)
    : null;
}

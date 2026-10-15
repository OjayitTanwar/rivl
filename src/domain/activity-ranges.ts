import type { Sample, Sport, RecordedLap } from "./types";
import type { HeartRateZoneThresholds } from "./heart-rate-zones";
import { processActivity } from "./processing";
export function analyzeRange(
  samples: Sample[],
  first: number,
  last: number,
  sport: Sport,
  maxHR = 190,
  hrZoneThresholds?: HeartRateZoneThresholds | null,
  rpe = 5,
) {
  const start = Math.max(0, Math.min(first, last)),
    end = Math.min(samples.length - 1, Math.max(first, last));
  const points = samples.slice(start, end + 1);
  return {
    points,
    summary: processActivity(
      points,
      sport,
      points[0]?.t ?? 0,
      points.at(-1)?.t ?? 0,
      maxHR,
      rpe,
      hrZoneThresholds,
    ),
  };
}
export function recordedLaps(
  samples: Sample[],
  marks: number[],
  sport: Sport,
  maxHR = 190,
): RecordedLap[] {
  if (!samples.length || !marks.length) return [];
  const boundaries = [
    samples[0]!.t,
    ...[...new Set(marks)]
      .filter(
        (t) => Number.isFinite(t) && t > samples[0]!.t && t < samples.at(-1)!.t,
      )
      .sort((a, b) => a - b),
    samples.at(-1)!.t,
  ];
  return boundaries.slice(1).map((end, i) => {
    const start = boundaries[i]!,
      raw = samples.filter((p) => p.t >= start && p.t <= end);
    const summary = processActivity(raw, sport, start, end, maxHR);
    return {
      start,
      end,
      distance: summary.distance,
      seconds: summary.moving,
      ascent: summary.ascent,
      avgHR: summary.avgHR,
      avgPower: summary.avgPower,
    };
  });
}

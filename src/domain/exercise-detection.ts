import type { Sample, Sport } from "./types";
import { distance, validSample } from "./geo";
/** GPS movement gate for an explicitly selected sport; not a transport classifier. */
export class ExerciseDetector {
  private points: Sample[] = [];
  constructor(private sport: Sport) {}
  reset() {
    this.points = [];
  }
  push(point: Sample, now = Date.now()): boolean {
    if (
      !validSample(point) ||
      point.accuracy > 20 ||
      point.t > now + 1000 ||
      now - point.t > 15000
    ) {
      this.reset();
      return false;
    }
    const last = this.points.at(-1);
    if (last && point.t <= last.t) return false;
    if (last) {
      const seconds = (point.t - last.t) / 1000;
      const velocity = distance(last, point) / seconds;
      const limits = {
        walk: [0.65, 2.4],
        hike: [0.5, 2.8],
        run: [1.8, 5.5],
        ride: [2.5, 12],
      } as const;
      const [min, max] = limits[this.sport];
      if (seconds > 20 || velocity < min || velocity > max) {
        this.points = [point];
        return false;
      }
    }
    this.points.push(point);
    this.points = this.points
      .filter((p) => point.t - p.t <= 120000)
      .slice(-256);
    const first = this.points[0]!;
    return (
      this.points.length >= 10 &&
      point.t - first.t >= 90000 &&
      distance(first, point) >= 60
    );
  }
}

export interface MotionSignal {
  walking: boolean;
  running: boolean;
  cycling: boolean;
  automotive: boolean;
  stationary: boolean;
  unknown: boolean;
  confidence: number;
}
export function exerciseMotionMatches(
  sport: Sport,
  signal: MotionSignal | null,
): boolean {
  if (
    !signal ||
    signal.confidence < 1 ||
    signal.automotive ||
    signal.stationary ||
    signal.unknown
  )
    return false;
  return sport === "ride"
    ? signal.cycling
    : sport === "run"
      ? signal.running
      : signal.walking;
}

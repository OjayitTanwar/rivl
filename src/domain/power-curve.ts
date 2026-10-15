import type { Activity, Sample } from "./types";
export const RECORDED_POWER_WINDOWS = [5, 30, 60, 300, 1200] as const;
export const RECORDED_POWER_POLICY = {
  version: 1,
  maxSamples: 100000,
  maxGapMs: 2500,
  maxWatts: 5000,
} as const;
export type RecordedPowerWindow = {
  seconds: number;
  watts: number | null;
  start?: number;
  end?: number;
};
export type RecordedPowerCurve = {
  windows: RecordedPowerWindow[];
  status: "available" | "not_eligible" | "no_measurements" | "limit";
};
/** Raw owner-recorded cycling samples only; route summaries and interpolation are never substituted. */
export function recordedCyclingPowerCurve(
  activity: Activity | undefined,
  samples: readonly Sample[],
  owner: string | undefined,
): RecordedPowerCurve {
  const windows: RecordedPowerWindow[] = RECORDED_POWER_WINDOWS.map(
    (seconds) => ({ seconds, watts: null }),
  );
  if (
    !activity ||
    !owner ||
    activity.ownerId !== owner ||
    activity.sport !== "ride" ||
    activity.demo ||
    activity.simulated ||
    !Number.isFinite(activity.startedAt) ||
    !Number.isFinite(activity.endedAt) ||
    activity.endedAt < activity.startedAt
  )
    return { windows, status: "not_eligible" };
  if (samples.length > RECORDED_POWER_POLICY.maxSamples)
    return { windows, status: "limit" };
  type Bout = {
    origin: number;
    times: number[];
    energy: number[];
    watts: number[];
  };
  const bouts: Bout[] = [];
  let bout: Bout | null = null,
    previous: Sample | undefined,
    previousValid = false,
    watermark = -Infinity;
  for (const current of samples) {
    const timeValid =
      Number.isFinite(current.t) &&
      current.t >= activity.startedAt &&
      current.t <= activity.endedAt &&
      current.t > watermark;
    if (
      Number.isFinite(current.t) &&
      current.t >= activity.startedAt &&
      current.t <= activity.endedAt
    )
      watermark = Math.max(watermark, current.t);
    const valid =
      timeValid &&
      Number.isSafeInteger(current.segment) &&
      current.segment >= 0 &&
      typeof current.watts === "number" &&
      Number.isFinite(current.watts) &&
      current.watts >= 0 &&
      current.watts <= RECORDED_POWER_POLICY.maxWatts;
    const span = previous ? (current.t - previous.t) / 1000 : NaN;
    if (
      !previous ||
      !previousValid ||
      !valid ||
      span <= 0 ||
      span * 1000 > RECORDED_POWER_POLICY.maxGapMs ||
      previous.segment !== current.segment
    ) {
      bout = null;
      previous = current;
      previousValid = valid;
      continue;
    }
    if (!bout) {
      bout = { origin: previous.t, times: [0], energy: [0], watts: [] };
      bouts.push(bout);
    }
    const relative = (current.t - bout.origin) / 1000;
    bout.times.push(relative);
    bout.watts.push(previous.watts!);
    bout.energy.push(
      bout.energy[bout.energy.length - 1]! + previous.watts! * span,
    );
    previous = current;
    previousValid = valid;
  }
  for (const window of windows) {
    for (const b of bouts) {
      const last = b.times[b.times.length - 1]!;
      if (last < window.seconds) continue;
      let right = 0,
        left = 0;
      const consider = (start: number, end: number, energy: number) => {
        const watts = energy / window.seconds;
        if (window.watts === null || watts > window.watts) {
          window.watts = watts;
          window.start = Math.round(b.origin + start * 1000);
          window.end = Math.round(b.origin + end * 1000);
        }
      };
      // For a piecewise-constant sampled signal, extrema have at least one boundary on a sample time.
      for (let i = 0; i < b.times.length; i++) {
        const start = b.times[i]!,
          end = start + window.seconds;
        if (end > last) break;
        while (right + 1 < b.times.length && b.times[right + 1]! <= end)
          right++;
        const energy =
          b.energy[right]! + (end - b.times[right]!) * (b.watts[right] ?? 0);
        consider(start, end, energy - b.energy[i]!);
      }
      for (let i = 0; i < b.times.length; i++) {
        const end = b.times[i]!,
          start = end - window.seconds;
        if (start < 0) continue;
        while (left + 1 < b.times.length && b.times[left + 1]! <= start) left++;
        const energy =
          b.energy[left]! + (start - b.times[left]!) * (b.watts[left] ?? 0);
        consider(start, end, b.energy[i]! - energy);
      }
    }
    if (window.watts !== null) window.watts = Math.round(window.watts);
  }
  return {
    windows,
    status: windows.some((w) => w.watts !== null)
      ? "available"
      : "no_measurements",
  };
}

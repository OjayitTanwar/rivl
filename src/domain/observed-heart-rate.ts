import type { Activity, Sample } from "./types";

export interface ObservedHeartRate {
  activityId: string;
  at: number;
  bpm: number;
}

/** A conservative recorded peak, not an estimate of physiological maximum.
 * Require three adjacent readings within 5 bpm spanning 10 seconds, without
 * gaps over 10 seconds. Use their minimum so an isolated high value cannot win.
 * Derive from saved samples, so deletion and edits also update the log.
 */
export function observedHeartRateLog(
  activities: readonly Activity[],
  ownerId: string,
): ObservedHeartRate[] {
  const records: ObservedHeartRate[] = [];
  for (const activity of activities) {
    if (
      activity.ownerId !== ownerId ||
      activity.demo ||
      activity.simulated ||
      !Number.isFinite(activity.startedAt) ||
      !Number.isFinite(activity.endedAt) ||
      activity.endedAt <= activity.startedAt
    )
      continue;
    let window: Sample[] = [];
    let peak: ObservedHeartRate | null = null;
    for (const sample of activity.route) {
      if (
        !Number.isFinite(sample.t) ||
        sample.t < activity.startedAt ||
        sample.t > activity.endedAt ||
        !Number.isInteger(sample.hr) ||
        sample.hr! < 30 ||
        sample.hr! > 240 ||
        !Number.isInteger(sample.segment)
      ) {
        window = [];
        continue;
      }
      const previous = window.at(-1);
      if (
        previous &&
        (sample.t <= previous.t ||
          sample.t - previous.t > 10000 ||
          sample.segment !== previous.segment)
      )
        window = [];
      window.push(sample);
      if (window.length > 128) window.shift();
      while (window.length > 1 && sample.t - window[0]!.t > 20000)
        window.shift();
      // Drop a spike and retain the stable suffix rather than smoothing raw data.
      while (
        window.length > 1 &&
        Math.max(...window.map((p) => p.hr!)) -
          Math.min(...window.map((p) => p.hr!)) >
          5
      )
        window.shift();
      if (window.length < 3 || sample.t - window[0]!.t < 10000) continue;
      const bpm = Math.min(...window.map((p) => p.hr!));
      if (!peak || bpm > peak.bpm)
        peak = { activityId: activity.id, at: sample.t, bpm };
    }
    if (peak) records.push(peak);
  }
  return records.sort(
    (a, b) => b.at - a.at || a.activityId.localeCompare(b.activityId),
  );
}

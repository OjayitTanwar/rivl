export interface HealthSnapshot {
  source: "HealthKit" | "Health Connect";
  readAt: number;
  measuredAt?: number | null;
  hrvReadings?: {
    id: string;
    at: number;
    value: number;
    method: "SDNN" | "RMSSD";
  }[];
  restingHR: number | null;
  hrv: number | null;
  baselineHRV: number | null;
  sampleDays: number;
  sleepHours: number | null;
  steps?: number | null;
  floorsClimbed?: number | null;
  activeEnergyKcal?: number | null;
  /** Local-day boundary used for connected movement aggregates. */
  movementStartedAt?: number;
  /** Exact local-day interval used for the cumulative step total. */
  stepsStartedAt?: number;
  sleepStartedAt?: number;
  sleepEndedAt?: number;
  /** Real dietary-water records written by a connected device or app. */
  water?: { id: string; at: number; ml: number }[];
  waterComplete?: boolean;
  weightKg?: number | null;
  weightMeasuredAt?: number | null;
}
export interface HealthProvider {
  connect(): Promise<HealthSnapshot>;
  refresh(): Promise<HealthSnapshot>;
  heartRate(start: number, end: number): Promise<{ t: number; hr: number }[]>;
  sleepHistory?(
    days: 7 | 30,
  ): Promise<import("../domain/sleep-analysis").SleepHistoryRead>;
}
export function recoveryInsight(h: HealthSnapshot, now = Date.now()): string {
  if (!h.measuredAt || now - h.measuredAt > 36 * 3600000)
    return "No recent HRV reading. Refresh health data before using it to guide today’s training.";
  if (h.sampleDays < 7 || !h.hrv || !h.baselineHRV)
    return "Building your personal baseline. At least 7 days of HRV readings are needed.";
  const change = (h.hrv / h.baselineHRV - 1) * 100;
  return change < -15
    ? "Your latest HRV is below your recent baseline. Consider an easier day, especially if you feel tired."
    : change > 15
      ? "Your latest HRV is above your recent baseline. Use how you feel alongside your training load."
      : "Your latest HRV is close to your personal baseline. Let your recent training and how you feel guide today.";
}

/** Each day gets equal weight, regardless of how often a device sampled HRV. */
export function hrvBaseline(readings: { t: number; value: number }[]) {
  const valid = readings
    .filter(
      (r) => Number.isFinite(r.t) && Number.isFinite(r.value) && r.value > 0,
    )
    .sort((a, b) => b.t - a.t);
  const days = new Map<string, number[]>();
  for (const sample of valid) {
    const d = new Date(sample.t),
      key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.set(key, [...(days.get(key) ?? []), sample.value]);
  }
  const means = [...days.values()].map(
    (values) => values.reduce((sum, v) => sum + v, 0) / values.length,
  );
  const prior = means.slice(1);
  return {
    hrv: means[0] ?? null,
    baselineHRV: prior.length
      ? prior.reduce((s, v) => s + v, 0) / prior.length
      : null,
    sampleDays: prior.length,
    measuredAt: valid[0]?.t ?? null,
  };
}
/** Union sleep intervals so overlapping watch/phone sources cannot double-count sleep. */
export function asleepHours(
  intervals: { start: number; end: number }[],
  from: number,
  to: number,
): number | null {
  const ordered = intervals
    .map((i) => ({ start: Math.max(from, i.start), end: Math.min(to, i.end) }))
    .filter(
      (i) =>
        Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start,
    )
    .sort((a, b) => a.start - b.start);
  if (!ordered.length) return null;
  let total = 0,
    start = ordered[0]!.start,
    end = ordered[0]!.end;
  for (const interval of ordered.slice(1)) {
    if (interval.start <= end) end = Math.max(end, interval.end);
    else {
      total += end - start;
      start = interval.start;
      end = interval.end;
    }
  }
  return (total + end - start) / 3600000;
}

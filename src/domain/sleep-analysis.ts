import { AppFailure } from "../security/errors";
export type SleepStage =
  "asleep" | "core" | "light" | "deep" | "rem" | "awake" | "in_bed" | "unknown";
export interface SleepInterval {
  id: string;
  start: number;
  end: number;
  stage: SleepStage;
  sourceName: string;
}
export interface SleepHistoryRead {
  provider: "HealthKit" | "Health Connect";
  readAt: number;
  from: number;
  to: number;
  complete: true;
  intervals: SleepInterval[];
}
export interface SleepSlice {
  start: number;
  end: number;
  stage: SleepStage;
  conflict: boolean;
}
export interface SleepSession {
  id: string;
  start: number;
  end: number;
  sleepHours: number | null;
  durations: Partial<Record<SleepStage, number>>;
  slices: SleepSlice[];
  sourceNames: string[];
  hasConflict: boolean;
  partial: boolean;
}
const stages: SleepStage[] = [
  "asleep",
  "core",
  "light",
  "deep",
  "rem",
  "awake",
  "in_bed",
  "unknown",
];
const asleepStages = new Set<SleepStage>([
  "asleep",
  "core",
  "light",
  "deep",
  "rem",
]);
export function validateSleepRead(read: SleepHistoryRead, now = Date.now()) {
  if (
    !read ||
    !["HealthKit", "Health Connect"].includes(read.provider) ||
    read.complete !== true ||
    ![read.from, read.to, read.readAt].every(Number.isFinite) ||
    read.from <= 0 ||
    read.to <= read.from ||
    read.to > read.readAt ||
    read.readAt > now + 60000 ||
    read.to - read.from > 32 * 86400000 ||
    !Array.isArray(read.intervals) ||
    read.intervals.length > 5000
  )
    throw new AppFailure(
      "validation",
      "The sleep history could not be read completely. Previous history is unchanged.",
    );
  const ids = new Map<string, string>();
  for (const r of read.intervals) {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      r.id.length > 500 ||
      !stages.includes(r.stage) ||
      ![r.start, r.end].every(Number.isFinite) ||
      r.start <= 0 ||
      r.end <= r.start ||
      r.end - r.start > 48 * 3600000 ||
      r.end <= read.from ||
      r.start >= read.to ||
      r.end > read.readAt + 60000 ||
      typeof r.sourceName !== "string" ||
      !r.sourceName ||
      r.sourceName.length > 200
    )
      throw new AppFailure(
        "validation",
        "The sleep history includes an invalid record. Previous history is unchanged.",
      );
    const key = JSON.stringify(r),
      old = ids.get(r.id);
    if (old && old !== key)
      throw new AppFailure(
        "validation",
        "Sleep records changed during the read. Refresh again.",
      );
    ids.set(r.id, key);
  }
  return read;
}
function classify(counts: Map<SleepStage, number>): {
  stage: SleepStage;
  conflict: boolean;
} {
  const precise = (["core", "light", "deep", "rem"] as SleepStage[]).filter(
    (s) => counts.has(s),
  );
  const sleeping = precise.length > 0 || counts.has("asleep");
  if ((counts.has("awake") && sleeping) || precise.length > 1)
    return { stage: "unknown", conflict: true };
  return {
    stage:
      precise[0] ??
      (counts.has("asleep")
        ? "asleep"
        : counts.has("awake")
          ? "awake"
          : counts.has("in_bed")
            ? "in_bed"
            : "unknown"),
    conflict: false,
  };
}
/** Sweep interval boundaries once. Generic envelopes never overwrite real stages;
 * conflicting provider stages remain unknown, and gaps are never filled as sleep. */
export function analyseSleep(read: SleepHistoryRead): SleepSession[] {
  validateSleepRead(read);
  const records = [...new Map(read.intervals.map((r) => [r.id, r])).values()]
    .map((r) => ({
      ...r,
      start: Math.max(r.start, read.from),
      end: Math.min(r.end, read.to),
      partial: r.start < read.from || r.end > read.to,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: (SleepInterval & { partial: boolean })[][] = [];
  let end = -Infinity;
  for (const r of records) {
    if (r.start > end) {
      groups.push([r]);
      end = r.end;
    } else {
      groups[groups.length - 1]!.push(r);
      end = Math.max(end, r.end);
    }
  }
  return groups
    .map((group) => {
      const events = group
          .flatMap((r) => [
            { at: r.start, stage: r.stage, delta: 1 },
            { at: r.end, stage: r.stage, delta: -1 },
          ])
          .sort((a, b) => a.at - b.at),
        counts = new Map<SleepStage, number>(),
        slices: SleepSlice[] = [];
      let at = events[0]!.at,
        i = 0;
      while (i < events.length) {
        const next = events[i]!.at;
        if (next > at && counts.size) {
          const state = classify(counts),
            previous = slices[slices.length - 1];
          if (
            previous &&
            previous.end === at &&
            previous.stage === state.stage &&
            previous.conflict === state.conflict
          )
            previous.end = next;
          else slices.push({ start: at, end: next, ...state });
        }
        while (i < events.length && events[i]!.at === next) {
          const e = events[i++]!,
            n = (counts.get(e.stage) ?? 0) + e.delta;
          if (n > 0) counts.set(e.stage, n);
          else counts.delete(e.stage);
        }
        at = next;
      }
      const durations: Partial<Record<SleepStage, number>> = {};
      for (const s of slices)
        durations[s.stage] =
          (durations[s.stage] ?? 0) + (s.end - s.start) / 3600000;
      const sleep = slices.filter((s) => asleepStages.has(s.stage));
      return {
        id: String(group[0]!.start),
        start: group[0]!.start,
        end: Math.max(...group.map((r) => r.end)),
        sleepHours: sleep.length
          ? sleep.reduce((n, s) => n + (s.end - s.start) / 3600000, 0)
          : null,
        durations,
        slices,
        sourceNames: [...new Set(group.map((r) => r.sourceName))],
        hasConflict: slices.some((s) => s.conflict),
        partial: group.some((r) => r.partial),
      };
    })
    .sort((a, b) => b.start - a.start);
}
/** Smallest clock-time arc containing recorded starts, handles midnight. */
export function sleepStartVariation(sessions: SleepSession[]): number | null {
  if (sessions.length < 3) return null;
  const minutes = sessions
    .map((s) => {
      const d = new Date(s.start);
      return d.getHours() * 60 + d.getMinutes();
    })
    .sort((a, b) => a - b);
  let largest = minutes[0]! + 1440 - minutes[minutes.length - 1]!;
  for (let i = 1; i < minutes.length; i++)
    largest = Math.max(largest, minutes[i]! - minutes[i - 1]!);
  return 1440 - largest;
}
export function sleepSummary(sessions: SleepSession[]) {
  const complete = sessions.filter((s) => !s.partial);
  const known = complete.filter((s) => s.sleepHours !== null);
  return {
    recordedSessions: sessions.length,
    sessionsWithSleep: known.length,
    averageSleepHours: known.length
      ? known.reduce((n, s) => n + s.sleepHours!, 0) / known.length
      : null,
    startVariationMinutes: sleepStartVariation(complete),
  };
}

import type { Activity, TrainingDay, CoachFacts, Challenge } from "./types";
export const DAY = 86400000;
export function dateKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function trainingHistory(
  activities: Activity[],
  days = 90,
  now = Date.now(),
): TrainingDay[] {
  const sorted = activities
      .filter((a) => !a.simulated)
      .sort((a, b) => a.startedAt - b.startedAt),
    first = Math.min(
      startOfDay(now) - (days - 1) * DAY,
      sorted[0] ? startOfDay(sorted[0].startedAt) : now,
    ),
    buckets = new Map<string, { load: number; distance: number }>();
  for (const a of sorted) {
    const k = dateKey(a.startedAt),
      b = buckets.get(k) ?? { load: 0, distance: 0 };
    b.load += a.summary.load;
    b.distance += a.summary.distance;
    buckets.set(k, b);
  }
  let fitness = 0,
    fatigue = 0;
  const out: TrainingDay[] = [];
  const day = new Date(first);
  for (; day.getTime() <= now; day.setDate(day.getDate() + 1)) {
    const key = dateKey(day.getTime()),
      b = buckets.get(key) ?? { load: 0, distance: 0 },
      form = fitness - fatigue;
    fitness += (b.load - fitness) * (1 - Math.exp(-1 / 42));
    fatigue += (b.load - fatigue) * (1 - Math.exp(-1 / 7));
    out.push({ date: key, ...b, fitness, fatigue, form });
  }
  return out.slice(-days);
}
export function weeklyStats(activities: Activity[], now = Date.now()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const start = date.getTime(),
    current = activities.filter(
      (a) => !a.simulated && a.startedAt >= start && a.startedAt <= now,
    ),
    previous = activities.filter(
      (a) =>
        !a.simulated && a.startedAt >= start - 7 * DAY && a.startedAt < start,
    );
  return {
    activities: current,
    distance: current.reduce((s, a) => s + a.summary.distance, 0),
    load: current.reduce((s, a) => s + a.summary.load, 0),
    moving: current.reduce((s, a) => s + a.summary.moving, 0),
    previousLoad: previous.reduce((s, a) => s + a.summary.load, 0),
  };
}
export function records(activities: Activity[]) {
  const best = new Map<number, { seconds: number; activity: Activity }>();
  for (const a of activities.filter((a) => !a.simulated && a.sport === "run"))
    for (const e of a.summary.bests) {
      if (!best.has(e.distance) || best.get(e.distance)!.seconds > e.seconds)
        best.set(e.distance, { seconds: e.seconds, activity: a });
    }
  return [...best]
    .map(([distance, v]) => ({ distance, ...v }))
    .sort((a, b) => a.distance - b.distance);
}
export function predictRace(
  activities: Activity[],
  target = 5000,
  now = Date.now(),
): number | null {
  const efforts = activities
    .filter(
      (a) => !a.simulated && a.sport === "run" && a.startedAt >= now - 60 * DAY,
    )
    .flatMap((a) => a.summary.bests)
    .filter((e) => e.distance >= 1000 && e.distance <= target && e.seconds > 0);
  return efforts.length
    ? Math.min(...efforts.map((e) => e.seconds * (target / e.distance) ** 1.06))
    : null;
}
export function matchedActivities(activity: Activity, all: Activity[]) {
  return all
    .filter(
      (a) =>
        !a.simulated &&
        !activity.simulated &&
        a.id !== activity.id &&
        a.sport === activity.sport &&
        Math.abs(a.summary.distance - activity.summary.distance) <=
          activity.summary.distance * 0.08 &&
        Math.abs(a.summary.ascent - activity.summary.ascent) < 30,
    )
    .sort((a, b) => b.startedAt - a.startedAt);
}
export function coachFacts(
  activities: Activity[],
  now = Date.now(),
): CoachFacts {
  const runs = activities
      .filter(
        (a) => !a.simulated && a.sport === "run" && a.summary.distance >= 1000,
      )
      .sort((a, b) => b.startedAt - a.startedAt),
    latest = runs[0],
    prior = latest ? matchedActivities(latest, runs).slice(0, 5) : [],
    avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1),
    baseline = avg(prior.map((a) => a.summary.avgPace)),
    hrPrior = prior.filter((a) => a.summary.avgHR),
    effBaseline = avg(
      hrPrior.map((a) => a.summary.avgSpeed / a.summary.avgHR!),
    ),
    weekly = weeklyStats(activities, now),
    history = trainingHistory(activities, 90, now),
    last = history[history.length - 1],
    splits = latest?.summary.splits.filter((s) => s.distance > 990) ?? [],
    fade =
      splits.length > 1
        ? (splits[splits.length - 1]!.pace / splits[0]!.pace - 1) * 100
        : null,
    highFatigue =
      !!last && last.fatigue > last.fitness * 1.4 && last.fatigue > 30;
  return {
    paceChange:
      baseline && latest ? (1 - latest.summary.avgPace / baseline) * 100 : null,
    efficiencyChange:
      effBaseline && latest?.summary.avgHR
        ? (latest.summary.avgSpeed / latest.summary.avgHR / effBaseline - 1) *
          100
        : null,
    loadChange: weekly.previousLoad
      ? (weekly.load / weekly.previousLoad - 1) * 100
      : null,
    highFatigue,
    pacingFade: fade,
    recommendation: highFatigue
      ? "easy"
      : weekly.activities.length >= 6
        ? "rest"
        : "steady",
    evidence: prior.length,
    caveats: [
      "Training guidance is an estimate, not a recovery diagnosis.",
      ...(prior.length < 3
        ? ["More comparable runs will improve confidence."]
        : []),
    ],
  };
}
export function progression(activities: Activity[], now = Date.now()) {
  const real = activities.filter((a) => !a.simulated && a.summary.moving >= 60),
    distance = real.reduce((s, a) => s + a.summary.distance, 0),
    ascent = real.reduce((s, a) => s + a.summary.ascent, 0),
    days = new Set(
      real
        .filter((a) => a.startedAt >= now - 28 * DAY)
        .map((a) => dateKey(a.startedAt)),
    ).size,
    best = records(real).find((r) => r.distance === 5000);
  return {
    level: Math.floor(Math.sqrt(distance / 1000)) + 1,
    endurance: Math.min(100, Math.round(distance / 10000)),
    speed: best
      ? Math.min(100, Math.max(0, Math.round(100 - (best.seconds - 900) / 20)))
      : 0,
    hills: Math.min(100, Math.round(ascent / 100)),
    consistency: Math.min(100, Math.round((days / 20) * 100)),
    distance,
    ascent,
    days,
  };
}
export function challengeProgress(c: Challenge, activities: Activity[]) {
  const list = activities.filter(
    (a) => !a.simulated && a.startedAt >= c.start && a.startedAt <= c.end,
  );
  return c.kind === "days"
    ? new Set(list.map((a) => dateKey(a.startedAt))).size
    : list.reduce(
        (s, a) =>
          s + (c.kind === "distance" ? a.summary.distance : a.summary.ascent),
        0,
      );
}

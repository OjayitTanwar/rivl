import type { SegmentEffort, LeaderboardGender } from "./types";
export type { LeaderboardGender } from "./types";
import type { LeaderboardScope } from "../services/segment-rankings";

export type SegmentStandingScope = LeaderboardScope | "gender";
export function isLeaderboardGender(
  value: unknown,
): value is LeaderboardGender {
  return value === "women" || value === "men" || value === "nonbinary";
}
/** Device results use only the owner's current explicit category; never infer it. */
export function ownerMatchesGender(
  category: unknown,
  requested: unknown,
): boolean {
  return (
    isLeaderboardGender(category) &&
    isLeaderboardGender(requested) &&
    category === requested
  );
}

export interface EffortStanding {
  athleteId: string;
  athlete: string;
  seconds: number;
  date: number;
  count: number;
  checked: boolean;
}
export function utcDateWindow(
  start: string,
  end: string,
): { since: number; until: number } {
  const parse = (value: string) => {
    const date = Date.parse(value + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date) ||
      new Date(date).toISOString().slice(0, 10) !== value
    )
      throw new Error("Enter dates as YYYY-MM-DD.");
    return date;
  };
  const since = parse(start),
    until = parse(end) + 86400000;
  if (until <= since)
    throw new Error("The finish date must be on or after the start.");
  return { since, until };
}
export function deviceSegmentStandings(
  efforts: SegmentEffort[],
  owner: string,
  segment: string,
  since = -Infinity,
  until = Infinity,
): EffortStanding[] {
  const eligible = efforts.filter(
    (e) =>
      e.athleteId === owner &&
      e.segmentId === segment &&
      Number.isFinite(e.seconds) &&
      e.seconds > 0 &&
      e.date >= since &&
      e.date < until,
  );
  if (!eligible.length) return [];
  const best = [...eligible].sort(
    (a, b) => a.seconds - b.seconds || a.date - b.date,
  )[0]!;
  return [
    {
      athleteId: owner,
      athlete: best.athlete,
      seconds: best.seconds,
      date: best.date,
      count: new Set(eligible.map((e) => e.id)).size,
      checked: false,
    },
  ];
}
export function compareSegmentPeriods(
  before: EffortStanding[],
  after: EffortStanding[],
) {
  const ids = new Set([...before, ...after].map((row) => row.athleteId));
  const old = new Map(before.map((row) => [row.athleteId, row]));
  const next = new Map(after.map((row) => [row.athleteId, row]));
  return [...ids]
    .map((id) => {
      const a = old.get(id),
        b = next.get(id);
      return {
        athleteId: id,
        athlete: (b ?? a)!.athlete,
        before: a?.seconds ?? null,
        after: b?.seconds ?? null,
        improvement: a && b ? (1 - b.seconds / a.seconds) * 100 : null,
      };
    })
    .sort(
      (a, b) =>
        (b.improvement ?? -Infinity) - (a.improvement ?? -Infinity) ||
        a.athleteId.localeCompare(b.athleteId),
    );
}

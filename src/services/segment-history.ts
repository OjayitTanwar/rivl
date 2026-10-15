import { supabase } from "./supabase";
import { AppFailure } from "../security/errors";
import {
  isLeaderboardGender,
  type LeaderboardGender,
  type SegmentStandingScope,
} from "../domain/segment-history";
import type { EffortStanding } from "../domain/segment-history";
export async function segmentStandings(
  segment: string,
  scope: SegmentStandingScope,
  options: {
    since?: number;
    until?: number;
    age?: number;
    weight?: number;
    club?: string;
    frequent?: boolean;
    gender?: LeaderboardGender;
  } = {},
): Promise<EffortStanding[]> {
  if (!supabase)
    throw new AppFailure(
      "validation",
      "Connect a cloud account to view verified standings.",
    );
  if (
    (options.since !== undefined && !Number.isFinite(options.since)) ||
    (options.until !== undefined && !Number.isFinite(options.until)) ||
    (options.since !== undefined &&
      options.until !== undefined &&
      options.since >= options.until)
  )
    throw new AppFailure("validation", "Choose a valid date range.");
  if (
    scope === "age" &&
    (!Number.isInteger(options.age) || options.age! < 0 || options.age! > 125)
  )
    throw new AppFailure("validation", "Enter an age from 0–125.");
  if (
    scope === "weight" &&
    (!Number.isFinite(options.weight) ||
      options.weight! < 25 ||
      options.weight! > 300)
  )
    throw new AppFailure("validation", "Enter weight from 25–300 kg.");
  if (scope === "gender" && !isLeaderboardGender(options.gender))
    throw new AppFailure("validation", "Choose a gender category.");
  const { data, error } = await supabase.rpc("segment_standings", {
    p_segment: segment,
    p_scope: scope,
    p_since:
      options.since === undefined
        ? null
        : new Date(options.since).toISOString(),
    p_until:
      options.until === undefined
        ? null
        : new Date(options.until).toISOString(),
    p_age: options.age === undefined ? null : Math.floor(options.age / 10) * 10,
    p_weight:
      options.weight === undefined ? null : Math.floor(options.weight / 5) * 5,
    p_club: options.club || null,
    p_frequent: options.frequent === true,
    ...(scope === "gender" ? { p_gender: options.gender } : {}),
  });
  if (error)
    throw new AppFailure(
      "server",
      "Segment history couldn’t load. Check your connection and retry.",
      true,
    );
  return (data ?? []).flatMap((row: Record<string, unknown>) => {
    const seconds = Number(row.seconds),
      date = Date.parse(String(row.date)),
      count = Number(row.effort_count);
    if (
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      !Number.isFinite(date) ||
      !Number.isInteger(count) ||
      count < 1 ||
      typeof row.athlete_id !== "string" ||
      typeof row.athlete !== "string"
    )
      return [];
    return [
      {
        athleteId: row.athlete_id,
        athlete: row.athlete,
        seconds,
        date,
        count,
        checked: true,
      },
    ];
  });
}

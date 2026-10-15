import { supabase } from "./supabase";
import { AppFailure } from "../security/errors";
import type { SegmentEffort } from "../domain/types";
export type LeaderboardScope =
  "overall" | "friends" | "age" | "weight" | "club";
export async function segmentRankings(
  segment: string,
  scope: LeaderboardScope,
  options: {
    since?: number;
    age?: number;
    weight?: number;
    club?: string;
  } = {},
): Promise<SegmentEffort[]> {
  if (!supabase)
    throw new AppFailure(
      "validation",
      "Community rankings need a connected backend.",
    );
  if (
    scope === "age" &&
    (!Number.isFinite(options.age) || options.age! < 0 || options.age! > 125)
  )
    throw new AppFailure("validation", "Enter an age from 0–125.");
  if (
    scope === "weight" &&
    (!Number.isFinite(options.weight) ||
      options.weight! < 25 ||
      options.weight! > 300)
  )
    throw new AppFailure("validation", "Enter weight from 25–300 kg.");
  const { data, error } = await supabase.rpc("segment_leaderboard", {
    p_segment: segment,
    p_filter: scope,
    p_since: options.since ? new Date(options.since).toISOString() : null,
    p_age: options.age == null ? null : Math.floor(options.age / 10) * 10,
    p_weight:
      options.weight == null ? null : Math.floor(options.weight / 5) * 5,
    p_club: options.club ?? null,
  });
  if (error)
    throw new AppFailure(
      "server",
      "Rankings couldn’t load. Check your connection and retry.",
      true,
    );
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    segmentId: String(row.segment_id),
    athleteId: String(row.athlete_id),
    athlete: String(row.athlete),
    seconds: Number(row.seconds),
    previous: row.previous == null ? null : Number(row.previous),
    expected: null,
    age: row.age == null ? null : Number(row.age),
    weight: row.weight == null ? null : Number(row.weight),
    date: Date.parse(String(row.date)),
    friend: row.friend === true,
    checked: true,
  }));
}

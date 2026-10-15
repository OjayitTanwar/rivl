import {
  assertCurrentCloudUser,
  cloudAccessToken,
  routeRepository,
} from "./routes";
import { supabase } from "./supabase";
import { database } from "../storage/database";
import { AppFailure } from "../security/errors";
import type {
  Session,
  SocialPost,
  RoutePlan,
  Challenge,
  Segment,
  SegmentEffort,
} from "../domain/types";

function feedTotal(value: unknown): number {
  const count = Array.isArray(value) ? value[0]?.count : undefined;
  if (!Number.isSafeInteger(count) || count < 0)
    throw new AppFailure(
      "server",
      "Community totals could not be read. Refresh again.",
      true,
    );
  return count;
}
async function prepareCache<T extends { id: string }>(
  prefix: string,
  values: T[],
) {
  const existing = await database.list<T>(prefix);
  const ids = new Set(values.map((value) => value.id));
  return {
    values: Object.fromEntries(
      values.map((value) => [prefix + value.id, value]),
    ),
    remove: existing
      .filter((value) => !ids.has(value.id))
      .map((value) => prefix + value.id),
  };
}
async function allRoutes(owner: string, token: string) {
  if (!supabase)
    throw new AppFailure("offline", "Cloud sync is not configured.");
  const rows: (RoutePlan & { owner_id: string })[] = [];
  let after: string | undefined;
  for (let page = 0; page < 200; page++) {
    await assertCurrentCloudUser(owner);
    let query = supabase
      .from("routes")
      .select("*")
      .eq("owner_id", owner)
      .order("id", { ascending: true })
      .limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query.setHeader(
      "Authorization",
      `Bearer ${token}`,
    );
    if (error) throw error;
    await assertCurrentCloudUser(owner);
    const batch = data ?? [];
    for (const row of batch) {
      if (
        row.owner_id !== owner ||
        typeof row.id !== "string" ||
        (after && row.id <= after)
      )
        throw new AppFailure(
          "server",
          "The route service returned an inconsistent page. Your saved routes were kept.",
          true,
        );
      rows.push(row);
      after = row.id;
    }
    if (batch.length < 500) return rows;
  }
  throw new AppFailure(
    "server",
    "Your route library is too large to refresh in one request. Your saved routes were kept.",
    true,
  );
}
export async function refreshCommunity(session: Session) {
  if (session.local || !supabase) return;
  const token = await cloudAccessToken(session.userId);
  const routeVersion = routeRepository.version(session.userId);
  const [feed, routes, challenges, segments, efforts] = await Promise.all([
    supabase
      .from("published_activities")
      .select(
        "*,profiles!published_activities_owner_id_fkey(name,handle),reaction_total:reactions(count),reactions(athlete_id),comment_total:comments(count),comments(id,body,created_at,athlete_id,profiles(name))",
      )
      .order("started_at", { ascending: false })
      .eq("reactions.athlete_id", session.userId)
      .limit(1, { referencedTable: "reactions" })
      .order("created_at", { ascending: false, referencedTable: "comments" })
      .order("id", { ascending: false, referencedTable: "comments" })
      .limit(20, { referencedTable: "comments" })
      .limit(50)
      .setHeader("Authorization", `Bearer ${token}`),
    allRoutes(session.userId, token),
    supabase
      .from("challenges")
      .select("*")
      .gte("ends_at", new Date().toISOString())
      .order("ends_at")
      .limit(100)
      .setHeader("Authorization", `Bearer ${token}`),
    supabase.rpc("list_segments").setHeader("Authorization", `Bearer ${token}`),
    supabase
      .from("segment_efforts")
      .select("*,profiles(name)")
      .eq("verified", true)
      .eq("algorithm_version", "gps-corridor-v1")
      .order("seconds")
      .limit(500)
      .setHeader("Authorization", `Bearer ${token}`),
  ]);
  for (const result of [feed, challenges, segments, efforts])
    if (result.error) throw result.error;
  await assertCurrentCloudUser(session.userId);
  // Fetch relationships only for the bounded visible result sets. Reading every
  // membership/friendship silently truncates at PostgREST's server row limit.
  const challengeIds = (challenges.data ?? []).map((c) => c.id);
  const athleteIds = [
    ...new Set((efforts.data ?? []).map((e) => e.athlete_id)),
  ];
  const membership = challengeIds.length
    ? await supabase
        .from("challenge_members")
        .select("challenge_id")
        .eq("athlete_id", session.userId)
        .in("challenge_id", challengeIds)
        .limit(100)
        .setHeader("Authorization", `Bearer ${token}`)
    : { data: [], error: null };
  if (membership.error) throw membership.error;
  const friends = athleteIds.length
    ? await Promise.all([
        supabase
          .from("friendships")
          .select("requester_id,recipient_id")
          .eq("status", "accepted")
          .eq("requester_id", session.userId)
          .in("recipient_id", athleteIds)
          .limit(500)
          .setHeader("Authorization", `Bearer ${token}`),
        supabase
          .from("friendships")
          .select("requester_id,recipient_id")
          .eq("status", "accepted")
          .eq("recipient_id", session.userId)
          .in("requester_id", athleteIds)
          .limit(500)
          .setHeader("Authorization", `Bearer ${token}`),
      ])
    : [];
  for (const result of friends) if (result.error) throw result.error;
  await assertCurrentCloudUser(session.userId);
  const posts: SocialPost[] = (feed.data ?? [])
    .filter((row) => row.profiles)
    .map((row) => ({
      id: row.id,
      athlete: row.profiles.name,
      handle: row.profiles.handle,
      initials: row.profiles.name
        .split(/\s+/)
        .slice(0, 2)
        .map((word: string) => word[0])
        .join(""),
      color: "#FFD348",
      caption: row.note,
      reactionCount: feedTotal(row.reaction_total),
      commentCount: feedTotal(row.comment_total),
      reactions: row.reactions.map((r: { athlete_id: string }) => r.athlete_id),
      comments: row.comments
        .filter((c: { profiles: unknown }) => c.profiles)
        .map(
          (c: {
            id: string;
            body: string;
            athlete_id: string;
            created_at: string;
            profiles: { name: string };
          }) => ({
            id: c.id,
            author: c.profiles.name,
            authorId: c.athlete_id,
            text: c.body,
            at: Date.parse(c.created_at),
            createdAt: c.created_at,
          }),
        )
        .reverse(),
      activity: {
        id: row.id,
        ownerId: row.owner_id,
        title: row.title,
        sport: row.sport,
        startedAt: Date.parse(row.started_at),
        endedAt: Date.parse(row.started_at) + row.summary.elapsed * 1000,
        summary: row.summary,
        route: (row.route ?? []).flat(),
        visibility: row.visibility,
        note: row.note,
        rpe: 0,
        sync: "synced",
        revision: 0,
        photos: [],
      },
    }));
  const routePlans: RoutePlan[] = routes.map((r) => ({
    id: r.id,
    name: r.name,
    sport: r.sport,
    points: r.points,
    distance: r.distance,
    ascent: r.ascent,
    surface: r.surface,
    saved: r.saved,
    waypoints: r.waypoints ?? [],
    routing: r.routing ?? "recorded",
  }));
  const active: Challenge[] = (challenges.data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    kind: c.kind,
    target: c.target,
    start: Date.parse(c.starts_at),
    end: Date.parse(c.ends_at),
    joined: (membership.data ?? []).some((m) => m.challenge_id === c.id),
  }));
  const friendIds = new Set(
    friends
      .flatMap((result) => result.data ?? [])
      .flatMap((f) => [f.requester_id, f.recipient_id]),
  );
  const rankings: SegmentEffort[] = (efforts.data ?? [])
    .filter((e) => e.profiles)
    .map((e) => ({
      id: e.id,
      segmentId: e.segment_id,
      athlete: e.profiles.name,
      athleteId: e.athlete_id,
      seconds: e.seconds,
      previous: e.previous,
      expected: e.expected,
      age: e.age_group,
      weight: e.weight_group,
      checked: e.algorithm_version === "gps-corridor-v1",
      date: Date.parse(e.created_at),
      friend: friendIds.has(e.athlete_id),
    }));
  const caches = await Promise.all([
    prepareCache("post:" + session.userId + ":", posts),
    prepareCache("challenge:" + session.userId + ":", active),
    prepareCache<Segment>(
      "segment:" + session.userId + ":",
      segments.data ?? [],
    ),
    prepareCache("effort:" + session.userId + ":", rankings),
  ]);
  const guard = () => assertCurrentCloudUser(session.userId);
  await guard();
  await routeRepository.reconcile(
    session.userId,
    routePlans,
    routeVersion,
    guard,
  );
  await guard();
  await database.commit(
    Object.assign({}, ...caches.map((cache) => cache.values)),
    caches.flatMap((cache) => cache.remove),
  );
}

import { AppFailure } from "../security/errors";
import { supabase } from "./supabase";
import type { ActivityRemote } from "./sync-engine";
import type { Activity } from "../domain/types";
import { encodeSamples, decodeSamples, publicationPoints } from "../domain/geo";
import { photoBytes } from "./media";
import { database } from "../storage/database";
import {
  compareRemoteTimestamps,
  decodeRemoteActivity,
  remoteIdentifier,
  remoteTimestamp,
} from "../domain/remote-activity";

export interface TrackReadOptions {
  signal?: AbortSignal;
  canCommit?: () => boolean;
  cache?: boolean;
}
export async function downloadTrack(
  activity: Activity,
  options: TrackReadOptions = {},
) {
  const check = () => {
    if (options.signal?.aborted || options.canCommit?.() === false)
      throw new AppFailure("cancelled", "Track reading was cancelled.");
  };
  check();
  const cached = await database.samples(activity.id);
  check();
  if (cached.length || activity.demo || activity.sync !== "synced" || !supabase)
    return cached;
  let query = supabase
    .from("activity_tracks")
    .select("samples,encoding")
    .eq("activity_id", activity.id)
    .eq("owner_id", activity.ownerId);
  if (options.signal) query = query.abortSignal(options.signal);
  const { data, error } = await query.maybeSingle();
  check();
  if (error) throw error;
  if (!data) return [];
  if (data.encoding !== "delta-e7-ms-v1")
    throw new AppFailure(
      "validation",
      "This track needs a newer version of RIVL.",
    );
  const points = decodeSamples(data.samples);
  check();
  if (options.cache !== false)
    await database.appendSamples(activity.id, points);
  return points;
}
export const remote: ActivityRemote = {
  async upload(a, samples) {
    if (!supabase)
      throw new AppFailure("validation", "Cloud sync is not configured.");
    if (a.demo || a.simulated)
      throw new AppFailure(
        "validation",
        "Simulated activities stay on this device.",
      );
    const photoKeys = new Set(a.photoKeys ?? []);
    for (const uri of a.photos.filter((p) => !/^https?:/.test(p))) {
      const name = uri.split("/").at(-1)!.split("?")[0]!;
      const key = `${a.ownerId}/${a.id}/${name}`;
      if (!photoKeys.has(key)) {
        const bytes = await photoBytes(uri);
        const { error } = await supabase.storage
          .from("activity-media")
          .upload(key, bytes, {
            contentType: name.endsWith(".png")
              ? "image/png"
              : name.endsWith(".heic")
                ? "image/heic"
                : name.endsWith(".webp")
                  ? "image/webp"
                  : "image/jpeg",
            upsert: true,
          });
        if (error) throw error;
        photoKeys.add(key);
      }
    }
    let points = publicationPoints(samples);
    // Bound transport/display size; full-resolution coordinates remain in p_raw.
    for (
      let tolerance = 16;
      points.length > 12000 && tolerance <= 1024;
      tolerance *= 2
    )
      points = publicationPoints(samples, tolerance);
    const { error } = await supabase.rpc("save_activity", {
      p_activity: {
        id: a.id,
        owner_id: a.ownerId,
        title: a.title,
        sport: a.sport,
        started_at: new Date(a.startedAt).toISOString(),
        ended_at: new Date(a.endedAt).toISOString(),
        summary: a.summary,
        visibility: a.visibility,
        note: a.note,
        rpe: a.rpe,
        revision: a.revision,
        photo_keys: [...photoKeys],
      },
      p_raw: samples.length ? encodeSamples(samples) : null,
      p_points: samples.length ? points : null,
    });
    if (error) throw error;
  },
  async pull(ownerId, since) {
    if (!supabase) return [];
    remoteIdentifier(ownerId);
    if (!Number.isFinite(since) || since < 0 || since > 8640000000000000)
      throw new AppFailure("validation", "The sync cursor is invalid.");
    const activities: Activity[] = [];
    const seen = new Set<string>();
    const pageSize = 500;
    let cursor: { updatedAt: string; id: string } | null = null;
    // A stable upper bound prevents continuously arriving workouts extending this pass.
    const clock = await supabase.rpc("sync_clock");
    if (clock.error || !clock.data)
      throw clock.error ?? new Error("Could not read sync clock.");
    const untilTime = remoteTimestamp(clock.data);
    const until = clock.data as string;
    const fromTime = Math.max(0, since - 60000);
    let pages = 0;
    while (true) {
      if (++pages > 10000)
        throw new AppFailure(
          "validation",
          "Cloud sync exceeded its page limit.",
        );
      let query = supabase
        .from("activities")
        .select("*")
        .eq("owner_id", ownerId)
        .gte("updated_at", new Date(fromTime).toISOString())
        .lte("updated_at", until)
        .order("updated_at")
        .order("id")
        .limit(pageSize);
      if (cursor)
        query = query.or(
          `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`,
        );
      const { data, error } = await query;
      if (error) throw error;
      if (!Array.isArray(data) || data.length > pageSize)
        throw new AppFailure(
          "validation",
          "Cloud sync returned an invalid page.",
        );
      // Validate the whole page before requesting any media. A bad row aborts
      // the pass, so the caller never persists a cursor past unreadable data.
      const decoded = data.map((row) => decodeRemoteActivity(row, ownerId));
      for (const row of decoded) {
        const ordering = cursor
          ? compareRemoteTimestamps(row.updatedAt, cursor.updatedAt)
          : 1;
        if (
          row.updatedTime < fromTime ||
          compareRemoteTimestamps(row.updatedAt, until) > 0 ||
          seen.has(row.activity.id) ||
          (cursor &&
            (ordering < 0 || (ordering === 0 && row.activity.id <= cursor.id)))
        )
          throw new AppFailure(
            "validation",
            "Cloud sync returned an inconsistent page boundary.",
          );
        seen.add(row.activity.id);
        cursor = { updatedAt: row.updatedAt, id: row.activity.id };
      }
      for (const row of decoded) {
        const keys = row.activity.photoKeys!;
        let photos: string[] = [];
        if (keys.length) {
          const result = await supabase.storage
            .from("activity-media")
            .createSignedUrls(keys, 86400);
          if (result.error) throw result.error;
          if (
            !Array.isArray(result.data) ||
            result.data.length !== keys.length ||
            result.data.some(
              (p) =>
                !p.signedUrl || p.error || !/^https:\/\//.test(p.signedUrl),
            )
          )
            throw new AppFailure(
              "validation",
              "Cloud activity media could not be read.",
            );
          photos = result.data.flatMap((p) =>
            p.signedUrl ? [p.signedUrl] : [],
          );
        }
        activities.push({ ...row.activity, photos });
      }
      if (data.length < pageSize) break;
    }
    return { activities, cursor: untilTime };
  },
};

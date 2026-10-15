import { supabase } from "./supabase";
import type { CommunityTrackPort } from "./community-track-repository";
import { AppFailure } from "../security/errors";
export interface ObservedTrackCell {
  lat: number;
  lng: number;
  evidence: "gps_observed_use";
  status: "corroborated";
  expiresAt: string;
}
async function rpc(name: string, args?: Record<string, unknown>) {
  if (!supabase)
    throw new AppFailure(
      "server",
      "Shared-map sync needs a configured cloud connection.",
    );
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new AppFailure(
      "server",
      "Shared-map sync is unavailable. Pending contributions stay on this device.",
    );
  return data;
}
function preference(data: unknown) {
  const row = Array.isArray(data) ? data[0] : data;
  const r =
    row && typeof row === "object" && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : null;
  if (
    !r ||
    typeof r.enabled !== "boolean" ||
    typeof r.revision !== "number" ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 1
  )
    throw new AppFailure(
      "server",
      "The shared-map preference could not be read.",
    );
  return { enabled: r.enabled, revision: r.revision };
}
export const communityTrackPort: CommunityTrackPort = {
  preference: async () => preference(await rpc("track_mapping_preference")),
  setPreference: async (enabled) =>
    preference(
      await rpc("set_track_mapping_preference", { p_enabled: enabled }),
    ),
  submit: async (activityId, sourceRevision, origin, preferenceRevision) => {
    await rpc("submit_track_contribution", {
      p_activity_id: activityId,
      p_revision: sourceRevision,
      p_origin: origin,
      p_preference_revision: preferenceRevision,
    });
  },
  withdraw: async (activityId) => {
    await rpc("withdraw_track_contribution", { p_activity_id: activityId });
  },
  deleteAll: async () => {
    await rpc("delete_my_track_contributions");
  },
};
export async function nearbyObservedTracks(
  lat: number,
  lng: number,
): Promise<ObservedTrackCell[]> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 85 ||
    Math.abs(lng) > 180
  )
    return [];
  const data = await rpc("list_observed_track_cells", {
    p_lat: lat,
    p_lng: lng,
  });
  return decodeObservedTrackCells(data, lat, lng);
}
export function decodeObservedTrackCells(
  data: unknown,
  lat: number,
  lng: number,
): ObservedTrackCell[] {
  if (!Array.isArray(data) || data.length > 200)
    throw new AppFailure("server", "The shared map could not be read.");
  const seen = new Set<string>();
  return data.map((row) => {
    const r =
      row && typeof row === "object" && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : null;
    if (
      !r ||
      typeof r.lat !== "number" ||
      typeof r.lng !== "number" ||
      !Number.isFinite(r.lat) ||
      !Number.isFinite(r.lng) ||
      Math.abs(r.lat) > 85 ||
      Math.abs(r.lng) > 180 ||
      Math.abs(r.lat - lat) > 0.04 ||
      Math.abs(r.lng - lng) > 0.04 ||
      typeof r.expires_at !== "string" ||
      !Number.isFinite(Date.parse(r.expires_at))
    )
      throw new AppFailure("server", "The shared map could not be read.");
    const key = r.lat + ":" + r.lng;
    if (seen.has(key))
      throw new AppFailure("server", "The shared map could not be read.");
    seen.add(key);
    return {
      lat: r.lat,
      lng: r.lng,
      evidence: "gps_observed_use",
      status: "corroborated",
      expiresAt: r.expires_at,
    };
  });
}

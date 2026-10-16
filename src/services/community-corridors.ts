import { supabase } from "./supabase";
import { cloudAccessToken, assertCurrentCloudUser } from "./routes";
import { AppFailure } from "../security/errors";
import type { Coordinate, Sport } from "../domain/types";
import { distance } from "../domain/geo";
export interface CommunityCorridor {
  id: string;
  revision: number;
  sport: Sport;
  points: Coordinate[];
  widthMeters: number;
  expiresAt?: string;
  state?: "proposed" | "disputed";
  routingEligible: false;
}
const invalid = () =>
  new AppFailure("server", "Community paths could not be read.");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function decodeCommunityCorridors(
  data: unknown,
  center?: Coordinate,
  review = false,
): CommunityCorridor[] {
  if (!Array.isArray(data) || data.length > (review ? 20 : 30)) throw invalid();
  let vertices = 0;
  const seen = new Set<string>();
  return data.flatMap((row) => {
    if (
      !row ||
      !uuid.test(row.id) ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      !["run", "ride", "walk", "hike"].includes(row.sport) ||
      !Array.isArray(row.points) ||
      row.points.length < 11 ||
      row.points.length > 256 ||
      typeof row.width_meters !== "number" ||
      !Number.isFinite(row.width_meters) ||
      row.width_meters < 0.5 ||
      row.width_meters > 20
    )
      throw invalid();
    vertices += row.points.length;
    if (vertices > 8000 || seen.has(row.id)) throw invalid();
    seen.add(row.id);
    const points: Coordinate[] = row.points.map((p: Coordinate) => {
      if (
        !p ||
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lng) ||
        Math.abs(p.lat) > 85 ||
        Math.abs(p.lng) > 180 ||
        (center && distance(center, p) > 4000)
      )
        throw invalid();
      return { lat: p.lat, lng: p.lng };
    });
    if (points.slice(1).some((p, i) => distance(points[i]!, p) > 25))
      throw invalid();
    if (review) {
      if (!["proposed", "disputed"].includes(row.state)) throw invalid();
    } else if (
      typeof row.expires_at !== "string" ||
      !Number.isFinite(Date.parse(row.expires_at))
    )
      throw invalid();
    if (!review && Date.parse(row.expires_at) <= Date.now()) return [];
    return [
      {
        id: row.id,
        revision: row.revision,
        sport: row.sport,
        points,
        widthMeters: row.width_meters,
        ...(review ? { state: row.state } : { expiresAt: row.expires_at }),
        routingEligible: false as const,
      },
    ];
  });
}
async function call(
  owner: string,
  name: string,
  args?: Record<string, unknown>,
) {
  const token = await cloudAccessToken(owner);
  if (!supabase) throw invalid();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      supabase
        .rpc(name, args)
        .setHeader("Authorization", `Bearer ${token}`)
        .abortSignal(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new AppFailure(
              "timeout",
              "Community paths timed out. Try again.",
              true,
            ),
          );
        }, 15000);
      }),
    ]);
    if (error)
      throw new AppFailure(
        "server",
        "Community paths are unavailable. Reconnect and try again.",
        true,
      );
    await assertCurrentCloudUser(owner);
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function nearbyCommunityCorridors(
  owner: string,
  center: Coordinate,
) {
  return decodeCommunityCorridors(
    await call(owner, "list_community_corridors", {
      p_lat: center.lat,
      p_lng: center.lng,
    }),
    center,
  );
}
export async function isTrackReviewer(owner: string): Promise<boolean> {
  const result = await call(owner, "is_track_reviewer");
  if (typeof result !== "boolean") throw invalid();
  return result;
}
export async function corridorReviewQueue(owner: string) {
  return decodeCommunityCorridors(
    await call(owner, "list_track_corridor_reviews"),
    undefined,
    true,
  );
}
export async function reviewCorridor(
  owner: string,
  corridor: CommunityCorridor,
  publish: boolean,
  reason: string,
) {
  if (!reason.trim() || reason.length > 500)
    throw new AppFailure("validation", "Add a short review reason.");
  await call(owner, "review_track_corridor", {
    p_id: corridor.id,
    p_revision: corridor.revision,
    p_publish: publish,
    p_reason: reason.trim(),
  });
}
export async function reportCorridor(
  owner: string,
  id: string,
  reason: "privacy" | "access" | "geometry" | "other",
) {
  await call(owner, "report_track_corridor", { p_id: id, p_reason: reason });
}

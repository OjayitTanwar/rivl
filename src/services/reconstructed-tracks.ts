import { supabase } from "./supabase";
import { mappedTrack, type MappedTrack } from "../domain/community-tracks";
import { distance } from "../domain/geo";
import type { Coordinate } from "../domain/types";
import { AppFailure } from "../security/errors";
export interface ReconstructedTrack {
  id: string;
  way: MappedTrack;
  startFraction: number;
  endFraction: number;
  evidence: "corroborated_observed_use";
  expiresAt: string;
  routingEligible: false;
}
const invalid = () =>
  new AppFailure("server", "Community paths could not be read. Try again.");
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export function decodeReconstructedTracks(
  data: unknown,
  center: Coordinate,
  now = Date.now(),
): ReconstructedTrack[] {
  if (
    !Array.isArray(data) ||
    data.length > 200 ||
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lng)
  )
    throw invalid();
  let vertices = 0;
  const seen = new Set<string>();
  return data.flatMap((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      !positive(row.way_id) ||
      !positive(row.version) ||
      !Number.isInteger(row.start_fraction) ||
      !Number.isInteger(row.end_fraction) ||
      row.start_fraction < 0 ||
      row.end_fraction > 1000 ||
      row.start_fraction >= row.end_fraction ||
      !Array.isArray(row.points) ||
      row.points.length < 2 ||
      row.points.length > 2000 ||
      !row.tags ||
      typeof row.tags !== "object" ||
      Array.isArray(row.tags) ||
      Object.keys(row.tags).length > 60 ||
      row.source !== "OpenStreetMap" ||
      row.license !== "ODbL-1.0" ||
      typeof row.expires_at !== "string" ||
      !Number.isFinite(Date.parse(row.expires_at))
    )
      throw invalid();
    vertices += row.points.length;
    if (vertices > 20000) throw invalid();
    if (
      row.points.some(
        (p: Coordinate) =>
          !p ||
          !Number.isFinite(p.lat) ||
          !Number.isFinite(p.lng) ||
          Math.abs(p.lat) > 85 ||
          Math.abs(p.lng) > 180 ||
          distance(center, p) > 4000,
      )
    )
      throw invalid();
    const id = `${row.way_id}:${row.version}:${row.start_fraction}:${row.end_fraction}`;
    if (seen.has(id)) throw invalid();
    seen.add(id);
    if (Date.parse(row.expires_at) <= now) return [];
    return [
      {
        id,
        way: mappedTrack(
          { id: row.way_id, version: row.version, tags: row.tags },
          row.points,
        ),
        startFraction: row.start_fraction,
        endFraction: row.end_fraction,
        evidence: "corroborated_observed_use" as const,
        expiresAt: row.expires_at,
        routingEligible: false as const,
      },
    ];
  });
}
export async function nearbyReconstructedTracks(
  center: Coordinate,
): Promise<ReconstructedTrack[]> {
  if (
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lng) ||
    Math.abs(center.lat) > 85 ||
    Math.abs(center.lng) > 180
  )
    throw invalid();
  if (!supabase)
    throw new AppFailure("server", "Community paths need a cloud connection.");
  const { data, error } = await supabase.rpc("list_track_candidates", {
    p_lat: center.lat,
    p_lng: center.lng,
  });
  if (error)
    throw new AppFailure(
      "server",
      "Community path discovery is unavailable. Try again later.",
    );
  return decodeReconstructedTracks(data, center);
}

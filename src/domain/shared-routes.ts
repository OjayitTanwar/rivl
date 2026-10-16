import type { Coordinate, RoutePlan, Sport } from "./types";
export interface SharedRoute {
  id: string;
  ownerId: string;
  title: string;
  creator: string;
  sport: Sport;
  points: Coordinate[];
  distance: number;
  surface: string;
  license: "CC-BY-4.0";
  publishedAt: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function decodeSharedRoute(value: unknown): SharedRoute {
  const r = value as Record<string, unknown>;
  if (
    !r ||
    !uuid.test(String(r.id)) ||
    !uuid.test(String(r.owner_id)) ||
    typeof r.title !== "string" ||
    !r.title.trim() ||
    r.title.length > 200 ||
    typeof r.creator !== "string" ||
    r.creator.length > 100 ||
    !["ride", "run", "walk", "hike"].includes(String(r.sport)) ||
    r.license !== "CC-BY-4.0" ||
    !Array.isArray(r.points) ||
    r.points.length < 2 ||
    r.points.length > 12000 ||
    typeof r.distance !== "number" ||
    !Number.isFinite(r.distance) ||
    r.distance < 100 ||
    r.distance > 10000000 ||
    typeof r.surface !== "string" ||
    r.surface.length > 200 ||
    typeof r.published_at !== "string" ||
    !Number.isFinite(Date.parse(r.published_at))
  )
    throw new Error("Shared route is invalid.");
  const points = r.points.map((p: unknown) => {
    const v = p as Coordinate;
    if (
      !v ||
      typeof v.lat !== "number" ||
      typeof v.lng !== "number" ||
      !Number.isFinite(v.lat) ||
      !Number.isFinite(v.lng) ||
      Math.abs(v.lat) > 85 ||
      Math.abs(v.lng) > 180
    )
      throw new Error("Shared route coordinates are invalid.");
    return { lat: v.lat, lng: v.lng };
  });
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    title: r.title,
    creator: r.creator,
    sport: r.sport as Sport,
    points,
    distance: r.distance,
    surface: r.surface,
    license: r.license,
    publishedAt: r.published_at,
  };
}
export function sharedRouteCopy(route: SharedRoute, id: string): RoutePlan {
  return {
    id,
    name: `${route.title} · ${route.creator}`.slice(0, 200),
    sport: route.sport,
    points: route.points.map((p) => ({ ...p, t: 0, accuracy: 0, segment: 0 })),
    distance: route.distance,
    ascent: 0,
    surface: `CC BY 4.0 · RIVL ${route.id} · ${route.creator}`,
    routing: "recorded",
    saved: true,
  };
}

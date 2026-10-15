import { distance } from "./geo";
import type { Coordinate, Sample, Sport } from "./types";
import { AppFailure } from "../security/errors";
import { numeric } from "../security/validation";

export const MAX_WAYPOINTS = 24;
export interface PlannedLine {
  points: Sample[];
  distance: number;
  kind: "manual" | "paths" | "recorded";
}
export interface RouteDraft {
  name: string;
  sport: Sport;
  waypoints: Coordinate[];
  line: PlannedLine;
}
export function coordinate(value: Coordinate): Coordinate {
  return {
    lat: numeric(value.lat, "Latitude", -85, 85),
    lng: numeric(value.lng, "Longitude", -180, 180),
  };
}
export function waypointList(points: Coordinate[], minimum = 0): Coordinate[] {
  if (
    !Array.isArray(points) ||
    points.length < minimum ||
    points.length > MAX_WAYPOINTS
  )
    throw new AppFailure(
      "validation",
      `Choose ${minimum}–${MAX_WAYPOINTS} route stops.`,
    );
  return points.map(coordinate);
}
export function directLine(waypoints: Coordinate[]): PlannedLine {
  const stops = waypointList(waypoints);
  let meters = 0;
  for (let i = 1; i < stops.length; i++)
    meters += distance(stops[i - 1]!, stops[i]!);
  if (meters > 2_000_000)
    throw new AppFailure("validation", "Keep a planned route under 2,000 km.");
  return {
    points: stops.map((point, i) => ({
      ...point,
      t: i * 1000,
      accuracy: 0,
      segment: 0,
    })),
    distance: meters,
    kind: "manual",
  };
}
export function appendWaypoint(
  points: Coordinate[],
  point: Coordinate,
): Coordinate[] {
  const next = coordinate(point);
  if (points.length && distance(points[points.length - 1]!, next) < 5)
    throw new AppFailure(
      "validation",
      "Choose a stop at least 5 metres from the last one.",
    );
  return waypointList([...points, next]);
}
export function decodeRoutedLine(value: unknown): PlannedLine {
  const data = value as { code?: unknown; routes?: unknown } | null;
  if (data?.code !== "Ok" || !Array.isArray(data.routes) || !data.routes.length)
    throw new AppFailure(
      "server",
      "No connected path was found. Move a stop closer to a road or trail, or save a direct route.",
      true,
    );
  const route = data.routes[0] as {
    distance?: unknown;
    geometry?: { type?: unknown; coordinates?: unknown };
  };
  const meters = numeric(route.distance, "Route distance", 0, 2_000_000);
  const coordinates = route.geometry?.coordinates;
  if (
    route.geometry?.type !== "LineString" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 50_000
  )
    throw new AppFailure(
      "server",
      "The routing service returned an invalid path. Try a shorter route.",
      true,
    );
  const points = coordinates.map((pair: unknown, i: number): Sample => {
    if (!Array.isArray(pair) || pair.length < 2)
      throw new AppFailure(
        "server",
        "The routing service returned invalid coordinates.",
        true,
      );
    return {
      ...coordinate({ lng: pair[0], lat: pair[1] }),
      t: i * 1000,
      accuracy: 0,
      segment: 0,
    };
  });
  return { points, distance: meters, kind: "paths" };
}

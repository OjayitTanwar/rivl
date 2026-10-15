import type { Coordinate, Sample, Sport } from "./types";
import type { GuidedRoute, NavigationStep } from "./navigation";
import { coordinate, waypointList } from "./route-planning";
import { numeric } from "../security/validation";
import { AppFailure } from "../security/errors";
export function decodeGooglePolyline(encoded: string): Sample[] {
  if (typeof encoded !== "string" || encoded.length > 500000)
    throw new AppFailure("server", "Invalid Google route geometry.");
  let index = 0,
    lat = 0,
    lng = 0;
  const points: Sample[] = [];
  const read = () => {
    let shift = 0,
      value = 0,
      byte = 0;
    do {
      if (index >= encoded.length || shift > 30)
        throw new AppFailure("server", "Incomplete Google route geometry.");
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63)
        throw new AppFailure("server", "Invalid Google route geometry.");
      value |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return value & 1 ? ~(value >> 1) : value >> 1;
  };
  while (index < encoded.length) {
    lat += read();
    lng += read();
    points.push({
      ...coordinate({ lat: lat / 1e5, lng: lng / 1e5 }),
      t: points.length * 1000,
      accuracy: 0,
      segment: 0,
    });
    if (points.length > 50000)
      throw new AppFailure("server", "Google route is too large.");
  }
  if (points.length < 2)
    throw new AppFailure("server", "No connected Google route found.");
  return points;
}
export function decodeGoogleRoutes(value: unknown): GuidedRoute[] {
  const data = value as {
    routes?: Array<{
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      warnings?: string[];
      legs?: Array<{
        steps?: Array<{
          distanceMeters?: number;
          startLocation?: { latLng?: { latitude: number; longitude: number } };
          navigationInstruction?: { instructions?: string };
        }>;
      }>;
    }>;
  };
  if (!Array.isArray(data?.routes) || !data.routes.length)
    throw new AppFailure(
      "server",
      "Google couldn’t find a route for this activity.",
    );
  return data.routes.slice(0, 4).map((route) => {
    const points = decodeGooglePolyline(route.polyline?.encodedPolyline ?? "");
    const meters = numeric(route.distanceMeters, "Route distance", 0, 2000000);
    let along = 0;
    const steps: NavigationStep[] = [
      {
        location: points[0]!,
        distanceAlong: 0,
        instruction: "Head along the route.",
        kind: "depart",
      },
    ];
    for (const step of route.legs?.flatMap((leg) => leg.steps ?? []) ?? []) {
      const location = step.startLocation?.latLng;
      if (location)
        steps.push({
          location: coordinate({
            lat: location.latitude,
            lng: location.longitude,
          }),
          distanceAlong: Math.min(meters, along),
          kind: "turn",
          instruction: (
            step.navigationInstruction?.instructions ??
            "Continue along the route."
          )
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .slice(0, 240),
        });
      along += numeric(step.distanceMeters ?? 0, "Step distance", 0, 2000000);
    }
    steps.push({
      location: points.at(-1)!,
      distanceAlong: meters,
      kind: "arrive",
      instruction: "You have arrived at your destination.",
    });
    return {
      points,
      distance: meters,
      kind: "paths",
      provider: "google",
      warnings: (route.warnings ?? [])
        .filter((w) => typeof w === "string")
        .slice(0, 5),
      steps,
    };
  });
}
export function googleMapsUrl(
  destination: Coordinate | string,
  sport: Sport,
  stops: Coordinate[] = [],
): string {
  const target =
    typeof destination === "string"
      ? destination
      : `${coordinate(destination).lat},${coordinate(destination).lng}`;
  const params = new URLSearchParams({
    api: "1",
    destination: target,
    travelmode: sport === "ride" ? "bicycling" : "walking",
    dir_action: "navigate",
  });
  if (stops.length)
    params.set(
      "waypoints",
      waypointList(stops)
        .slice(-3)
        .map((p) => `${p.lat},${p.lng}`)
        .join("|"),
    );
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

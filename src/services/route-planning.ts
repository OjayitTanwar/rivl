import type { Coordinate, Sport } from "../domain/types";
import {
  decodeRoutedLine,
  waypointList,
  type PlannedLine,
} from "../domain/route-planning";
import { AppFailure } from "../security/errors";
import { apiJson } from "../security/transport";
import { decodeGuidedRoute, type GuidedRoute } from "../domain/navigation";
import { config } from "./config";
import { decodeGoogleRoutes } from "../domain/google-maps";

export interface RoutingProvider {
  alternatives?(
    points: Coordinate[],
    sport: Sport,
    signal?: AbortSignal,
  ): Promise<GuidedRoute[]>;
  route(
    points: Coordinate[],
    sport: Sport,
    signal?: AbortSignal,
  ): Promise<PlannedLine>;
  guide(
    points: Coordinate[],
    sport: Sport,
    signal?: AbortSignal,
  ): Promise<GuidedRoute>;
}
export function osrmProvider(
  endpoints: { foot: string; bike: string },
  transport: typeof fetch = fetch,
  now: () => number = Date.now,
): RoutingProvider {
  let lastRequest = -Infinity;
  async function requestRoute(
    points: Coordinate[],
    sport: Sport,
    steps: boolean,
    signal?: AbortSignal,
    alternatives = false,
  ): Promise<unknown> {
    const stops = waypointList(points, 2);
    if (now() - lastRequest < 1100)
      throw new AppFailure(
        "rate_limit",
        "Wait a moment before finding another path.",
        true,
      );
    const endpoint = new URL(
      sport === "ride" ? endpoints.bike : endpoints.foot,
    );
    const baseUrl = endpoint.href;
    const coordinates = stops
      .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
      .join(";");
    endpoint.pathname =
      endpoint.pathname.replace(/\/$/, "") + `/route/v1/driving/${coordinates}`;
    endpoint.search = new URLSearchParams({
      overview: "full",
      geometries: "geojson",
      steps: String(steps),
      alternatives: String(alternatives),
      generate_hints: "false",
      radiuses: stops.map(() => "200").join(";"),
    }).toString();
    lastRequest = now();
    return apiJson(
      baseUrl,
      endpoint.href,
      {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "RIVL/1.0 (native fitness route planner)",
        },
      },
      {
        transport,
        timeoutMs: 20_000,
        maxBytes: 4_000_000,
        checkResponse(response) {
          if (!response.ok)
            throw new AppFailure(
              response.status === 429 ? "rate_limit" : "server",
              response.status === 429
                ? "The route service is busy. Wait a moment and try again."
                : "Paths are unavailable right now. Retry, or keep your direct route.",
              true,
            );
        },
      },
    );
  }
  return {
    async alternatives(points, sport, signal) {
      const body = (await requestRoute(
        points,
        sport,
        true,
        signal,
        points.length === 2,
      )) as { routes?: unknown[] };
      return (body.routes ?? []).slice(0, 3).map((route) => ({
        ...decodeGuidedRoute({ code: "Ok", routes: [route] }),
        provider: "osm" as const,
      }));
    },
    async route(points, sport, signal) {
      return decodeRoutedLine(await requestRoute(points, sport, false, signal));
    },
    async guide(points, sport, signal) {
      return decodeGuidedRoute(await requestRoute(points, sport, true, signal));
    },
  };
}
const openRouting = osrmProvider({
  foot:
    process.env.EXPO_PUBLIC_ROUTING_FOOT_URL ||
    "https://routing.openstreetmap.de/routed-foot",
  bike:
    process.env.EXPO_PUBLIC_ROUTING_BIKE_URL ||
    "https://routing.openstreetmap.de/routed-bike",
});
export async function googleGuides(
  points: Coordinate[],
  sport: Sport,
  signal?: AbortSignal,
): Promise<GuidedRoute[]> {
  const stops = waypointList(points, 2);
  const location = (p: Coordinate) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lng } },
  });
  const body = await apiJson(
    "https://routes.googleapis.com",
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googleMapsKey,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps,routes.warnings",
      },
      body: JSON.stringify({
        origin: location(stops[0]!),
        destination: location(stops.at(-1)!),
        intermediates: stops.slice(1, -1).map(location),
        travelMode: sport === "ride" ? "BICYCLE" : "WALK",
        computeAlternativeRoutes: stops.length === 2,
        languageCode: "en",
        polylineQuality: "HIGH_QUALITY",
      }),
    },
    {
      timeoutMs: 20_000,
      maxBytes: 4_000_000,
      checkResponse(response) {
        if (!response.ok)
          throw new AppFailure(
            "server",
            response.status === 429
              ? "Google’s daily limit was reached. Use free path guidance or Google Maps directly."
              : "Google routing is unavailable. Check the Maps connection in Settings.",
            true,
          );
      },
    },
  );
  return decodeGoogleRoutes(body);
}
// Saved/offline route planning remains independent of Google’s content storage restrictions.
export const routeProvider: RoutingProvider = {
  route: openRouting.route,
  guide: async (points, sport, signal) =>
    config.googleMapsKey
      ? (await googleGuides(points, sport, signal))[0]!
      : openRouting.guide(points, sport, signal),
  alternatives: (points, sport, signal) =>
    config.googleMapsKey
      ? googleGuides(points, sport, signal)
      : openRouting.alternatives!(points, sport, signal),
};

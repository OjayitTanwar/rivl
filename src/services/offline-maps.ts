import * as Crypto from "expo-crypto";
import type { Coordinate, Sample, RoutePlan } from "../domain/types";
import type { GuidedRoute } from "../domain/navigation";
import { database } from "../storage/database";
import { loadPathNetwork } from "./path-network";
import { routeProvider } from "./route-planning";
import { distance } from "../domain/geo";
import { AppFailure } from "../security/errors";
export interface OfflineArea {
  id: string;
  name: string;
  center: Coordinate;
  radius: number;
  downloadedAt: number;
  lines: Sample[][];
  walkingLines?: Sample[][];
  cyclingLines?: Sample[][];
  limited: boolean;
}
export const offlineMapStyle = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background" as const,
      paint: { "background-color": "#ECECE3" },
    },
  ],
};
export const offlineAreas = (owner: string) =>
  database.list<OfflineArea>(`offline-area:${owner}:`);
export async function saveOfflineArea(
  owner: string,
  name: string,
  center: Coordinate,
) {
  if ((await offlineAreas(owner)).length >= 5)
    throw new AppFailure(
      "validation",
      "Remove an offline area before saving another. Up to five areas can be stored.",
    );
  const result = await loadPathNetwork(center, "all");
  if (!result.lines.length)
    throw new AppFailure(
      "server",
      "No roads or paths were returned for this area. Nothing was downloaded.",
    );
  const area: OfflineArea = {
    id: Crypto.randomUUID(),
    name: name.trim().slice(0, 100) || "Nearby paths",
    center,
    radius: 1200,
    downloadedAt: Date.now(),
    ...result,
  };
  await database.set(`offline-area:${owner}:${area.id}`, area);
  return area;
}
export async function offlineAreaAt(owner: string, point: Coordinate) {
  return (
    (await offlineAreas(owner))
      .filter((area) => distance(area.center, point) < area.radius)
      .sort(
        (a, b) => distance(a.center, point) - distance(b.center, point),
      )[0] ?? null
  );
}
export const removeOfflineArea = (owner: string, id: string) =>
  database.remove(`offline-area:${owner}:${id}`);
export function guidedKey(owner: string, route: RoutePlan) {
  let hash = 2166136261;
  for (const point of [...route.points, ...(route.waypoints ?? [])])
    for (const byte of `${point.lat},${point.lng};`) {
      hash = Math.imul(hash ^ byte.charCodeAt(0), 16777619) >>> 0;
    }
  return `offline-guide:${owner}:${route.id}:${route.sport}:${hash}`;
}
export async function saveOfflineGuide(owner: string, route: RoutePlan) {
  if (route.routing === "manual" || route.points.length < 2)
    throw new AppFailure(
      "validation",
      "Find mapped paths before downloading directions.",
    );
  const stops = route.waypoints?.length
    ? route.waypoints
    : [route.points[0]!, route.points.at(-1)!];
  const guide = await routeProvider.guide(stops, route.sport);
  await database.set(guidedKey(owner, route), guide);
  return guide;
}
export const savedOfflineGuide = (owner: string, route: RoutePlan) =>
  database.get<GuidedRoute>(guidedKey(owner, route));

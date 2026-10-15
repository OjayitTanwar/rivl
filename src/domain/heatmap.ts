import type { Sample } from "./types";
/** One visit per activity per roughly 100 m cell, independent of sampling frequency. */
export function heatmapCells(routes: Sample[][]) {
  const counts = new Map<
    string,
    { lat: number; lng: number; visits: number }
  >();
  for (const route of routes) {
    const visited = new Set<string>();
    for (const p of route) {
      const lat = Math.floor(p.lat * 1000) / 1000 + 0.0005,
        lng = Math.floor(p.lng * 1000) / 1000 + 0.0005,
        key = lat + ":" + lng;
      if (visited.has(key) || !Number.isFinite(lat) || !Number.isFinite(lng))
        continue;
      visited.add(key);
      const old = counts.get(key);
      counts.set(key, { lat, lng, visits: (old?.visits ?? 0) + 1 });
    }
  }
  return [...counts.values()].slice(0, 30000);
}
export const heatmapFeatures = (
  cells: { lat: number; lng: number; visits: number }[],
) => ({
  type: "FeatureCollection" as const,
  features: cells.map((p) => ({
    type: "Feature" as const,
    properties: { visits: p.visits },
    geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
  })),
});

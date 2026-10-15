import type { Sample } from "../domain/types";
import { routeLines } from "../domain/geo";
import { config } from "../services/config";
export const mapStyle = config.mapStyle || {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      paint: { "raster-saturation": -0.85, "raster-opacity": 0.82 },
    },
  ],
};
export function geometry(points: Sample[], lines?: Sample[][]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "MultiLineString" as const,
      coordinates: (lines ?? routeLines(points))
        .filter((l) => l.length > 1)
        .map((l) => l.map((p) => [p.lng, p.lat])),
    },
  };
}
export function bounds(points: Sample[]): [[number, number], [number, number]] {
  if (!points.length)
    return [
      [-122.5, 37.748],
      [-122.438, 37.788],
    ];
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return [
    [west - 0.002, south - 0.002],
    [east + 0.002, north + 0.002],
  ];
}

import type { Coordinate } from "./types";
import { distance } from "./geo";
export function routeSuggestionStops(
  center: Coordinate,
  meters: number,
  bearing: number,
  popular: { lat: number; lng: number; visits: number }[] = [],
): Coordinate[] {
  const destination = (angle: number, span: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      lat: center.lat + (Math.cos(rad) * span) / 111320,
      lng:
        center.lng +
        (Math.sin(rad) * span) /
          (111320 * Math.max(0.15, Math.cos((center.lat * Math.PI) / 180))),
    };
  };
  const span = Math.max(500, Math.min(20000, meters)) / 3.5;
  const first = destination(bearing, span),
    second = destination(bearing + 60, span);
  const closest = popular
    .filter((p) => distance(p, first) < span * 0.6)
    .sort((a, b) => b.visits - a.visits)[0];
  return [center, closest ?? first, second, center];
}

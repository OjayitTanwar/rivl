import type { Coordinate, Sample } from "./types";
import { distance, routeLines, simplify } from "./geo";

/** Clip overlays to the local area without joining separate GPS segments or gaps. */
export function nearbyMapLines(
  routes: Sample[][],
  center: Coordinate,
  radius = 12000,
  budget = 6000,
): Sample[][] {
  const result: Sample[][] = [];
  let remaining = budget;
  for (const route of routes) {
    for (const segment of routeLines(route)) {
      let run: Sample[] = [];
      const flush = () => {
        if (run.length > 1 && remaining > 1) {
          const line = simplify(run, 10);
          // Truncate rather than connect discontinuous samples to satisfy the display budget.
          const part = line.slice(0, Math.min(remaining, 800));
          if (part.length > 1) {
            result.push(part);
            remaining -= part.length;
          }
        }
        run = [];
      };
      for (const point of segment) {
        if (distance(center, point) <= radius) run.push(point);
        else flush();
      }
      flush();
      if (remaining < 2) return result;
    }
  }
  return result;
}
export function nearbyCoordinates<T extends Coordinate>(
  points: T[],
  center: Coordinate,
  radius = 12000,
  limit = 1200,
): T[] {
  return points.filter((p) => distance(center, p) <= radius).slice(0, limit);
}

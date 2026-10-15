import type { Coordinate, RoutePlan } from "./types";
import { distance } from "./geo";
/** Join a saved route at its nearest point, then keep the remaining route shape. */
export function navigationStops(
  here: Coordinate,
  saved?: RoutePlan,
  reverse = false,
): Coordinate[] {
  if (!saved) return [here];
  const points = [...saved.points];
  if (reverse) points.reverse();
  if (points.length < 2)
    throw new Error("This route needs at least two points.");
  let nearest = 0;
  for (let i = 1; i < points.length; i++)
    if (distance(here, points[i]!) < distance(here, points[nearest]!))
      nearest = i;
  // At the shared start/end of a loop choose the start, not instant arrival.
  if (distance(here, points[0]!) < 150) nearest = 0;
  const rest = points.slice(nearest);
  const stops: Coordinate[] = [here];
  for (
    let i = 0;
    i < rest.length;
    i += Math.max(1, Math.ceil(rest.length / 10))
  ) {
    const p = rest[i]!;
    if (distance(stops.at(-1)!, p) >= 15) stops.push(p);
  }
  const end = points.at(-1)!;
  if (distance(stops.at(-1)!, end) >= 5) stops.push(end);
  if (stops.length < 2)
    throw new Error("You’re already at the end. Try the reverse direction.");
  return stops;
}

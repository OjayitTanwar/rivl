import type { Coordinate, Sample, Sport } from "./types";
import { distance } from "./geo";

function gap(point: Coordinate, a: Coordinate, b: Coordinate): number {
  const scale = Math.cos((point.lat * Math.PI) / 180);
  const x = (point.lng - a.lng) * scale;
  const y = point.lat - a.lat;
  const dx = (b.lng - a.lng) * scale;
  const dy = b.lat - a.lat;
  const fraction = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - fraction * dx, y - fraction * dy) * 111195;
}

// This identifies missing *mapped* infrastructure, never actual access or safety.
export function upcomingInfrastructureWarning(
  route: Sample[],
  paths: Sample[][],
  along: number,
  sport: Sport,
  limited = false,
): string | null {
  if (limited || route.length < 2 || !paths.length) return null;
  const samples: Coordinate[] = [];
  let traversed = 0;
  let next = Math.max(0, along) + 60;
  const end = Math.max(0, along) + 300;
  for (let i = 1; i < route.length && next <= end; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const meters = distance(a, b);
    if (!Number.isFinite(meters) || meters < 1 || meters > 500) {
      traversed += Math.max(0, meters);
      next = Math.max(next, traversed + 60);
      continue;
    }
    while (next <= end && next <= traversed + meters) {
      const fraction = (next - traversed) / meters;
      samples.push({
        lat: a.lat + (b.lat - a.lat) * fraction,
        lng: a.lng + (b.lng - a.lng) * fraction,
      });
      next += 60;
    }
    traversed += meters;
  }
  if (samples.length < 2) return null;
  const covered = samples.filter((point) =>
    paths.some((line) =>
      line.some(
        (vertex, index) =>
          index > 0 && gap(point, line[index - 1]!, vertex) <= 30,
      ),
    ),
  ).length;
  if (covered > samples.length / 4) return null;
  return sport === "ride"
    ? "I can't confirm a mapped cycle track ahead. Check signs and traffic before continuing."
    : "I can't confirm a mapped walking path ahead. Check signs and traffic before continuing.";
}

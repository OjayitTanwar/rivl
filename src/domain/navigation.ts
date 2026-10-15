import type { Coordinate, Sample } from "./types";
import { distance } from "./geo";
import {
  decodeRoutedLine,
  type PlannedLine,
  coordinate,
} from "./route-planning";
import { AppFailure } from "../security/errors";

export interface NavigationStep {
  location: Coordinate;
  distanceAlong: number;
  instruction: string;
  kind: "depart" | "arrive" | "turn";
}
export interface GuidedRoute extends PlannedLine {
  provider?: "google" | "osm";
  warnings?: string[];
  steps: NavigationStep[];
}

function words(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/[\x00-\x1f]/g, " ")
        .trim()
        .slice(0, 80)
    : "";
}
function instruction(type: string, modifier: string, road: string): string {
  if (type === "arrive") return "You have arrived at your destination.";
  if (type === "depart") return "Head along the route.";
  const direction =
    (
      {
        left: "left",
        right: "right",
        "slight left": "slightly left",
        "slight right": "slightly right",
        "sharp left": "sharply left",
        "sharp right": "sharply right",
        straight: "straight",
        uturn: "around",
      } as Record<string, string>
    )[modifier] ?? "ahead";
  const action =
    type === "roundabout" || type === "rotary"
      ? "At the roundabout, go"
      : type === "fork"
        ? "At the fork, keep"
        : type === "continue" || direction === "straight"
          ? "Continue"
          : "Turn";
  return `${action} ${direction}${road ? ` onto ${road}` : ""}.`;
}
function nearestDistanceAlong(
  line: Sample[],
  point: Coordinate,
  minimumAlong = 0,
): { along: number; offset: number } {
  let best = { along: 0, offset: Infinity };
  let cumulative = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!,
      b = line[i]!;
    const scale = Math.cos((point.lat * Math.PI) / 180);
    const dx = (b.lng - a.lng) * scale,
      dy = b.lat - a.lat;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.lng - a.lng) * scale * dx + (point.lat - a.lat) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const snapped = {
      lat: a.lat + t * (b.lat - a.lat),
      lng: a.lng + t * (b.lng - a.lng),
    };
    const offset = distance(point, snapped);
    const length = distance(a, b);
    const along = cumulative + t * length;
    if (along >= minimumAlong && offset < best.offset) best = { along, offset };
    cumulative += length;
  }
  return best;
}
export function decodeGuidedRoute(value: unknown): GuidedRoute {
  const line = decodeRoutedLine(value);
  const routes = (value as { routes?: unknown[] }).routes;
  const legs = (routes?.[0] as { legs?: unknown[] } | undefined)?.legs;
  if (!Array.isArray(legs))
    throw new AppFailure(
      "server",
      "Turn instructions are unavailable for this route.",
      true,
    );
  const raw = legs.flatMap((leg) =>
    Array.isArray((leg as { steps?: unknown[] }).steps)
      ? (leg as { steps: unknown[] }).steps
      : [],
  );
  if (!raw.length || raw.length > 10_000)
    throw new AppFailure(
      "server",
      "Turn instructions are unavailable for this route.",
      true,
    );
  let previousAlong = 0;
  const steps: NavigationStep[] = raw.map((item) => {
    const step = item as {
      maneuver?: { location?: unknown; type?: unknown; modifier?: unknown };
      name?: unknown;
    };
    const pair = step.maneuver?.location;
    if (!Array.isArray(pair) || pair.length < 2)
      throw new AppFailure(
        "server",
        "The route has invalid turn instructions.",
        true,
      );
    const location = coordinate({ lng: pair[0], lat: pair[1] });
    const type = words(step.maneuver?.type);
    const kind =
      type === "arrive" ? "arrive" : type === "depart" ? "depart" : "turn";
    const along =
      kind === "arrive"
        ? line.distance
        : nearestDistanceAlong(line.points, location, previousAlong).along;
    previousAlong = along;
    return {
      location,
      distanceAlong: along,
      instruction: instruction(
        type,
        words(step.maneuver?.modifier),
        words(step.name),
      ),
      kind,
    };
  });
  return { ...line, steps };
}
export interface NavigationProgress {
  step: NavigationStep;
  distanceToStep: number;
  offRoute: boolean;
  arrived: boolean;
  along: number;
}
export function navigationProgress(
  route: GuidedRoute,
  location: Coordinate,
  accuracy = 0,
  previousAlong = 0,
): NavigationProgress {
  const snapped = nearestDistanceAlong(
    route.points,
    location,
    Math.max(0, previousAlong - 50),
  );
  const arrival =
    route.steps.findLast((step) => step.kind === "arrive") ??
    route.steps[route.steps.length - 1]!;
  const arrived =
    accuracy <= 50 &&
    snapped.along >= Math.max(0, route.distance - 75) &&
    distance(location, arrival.location) < Math.max(20, Math.min(accuracy, 35));
  const step =
    route.steps.find(
      (item) =>
        item.kind !== "depart" && item.distanceAlong > snapped.along + 12,
    ) ?? arrival;
  return {
    step,
    distanceToStep: Math.max(0, step.distanceAlong - snapped.along),
    offRoute: accuracy <= 50 && snapped.offset > Math.max(45, accuracy * 2),
    arrived,
    along: snapped.along,
  };
}
export function approachInstruction(progress: NavigationProgress): string {
  if (progress.arrived) return "You have arrived at your destination.";
  const meters = progress.distanceToStep;
  if (meters <= 25) return progress.step.instruction;
  const rounded =
    meters < 100
      ? Math.round(meters / 10) * 10
      : meters < 1000
        ? Math.round(meters / 50) * 50
        : Math.round(meters / 100) * 100;
  return `In ${rounded >= 1000 ? `${(rounded / 1000).toFixed(1)} kilometres` : `${rounded} metres`}, ${progress.step.instruction.charAt(0).toLowerCase()}${progress.step.instruction.slice(1)}`;
}

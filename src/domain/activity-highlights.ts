import type { Sample, Sport } from "./types";
import { distance, validSample } from "./geo";
export type HighlightKind = "fastest" | "climb" | "highest";
export interface ActivityHighlight {
  kind: HighlightKind;
  title: string;
  points: Sample[];
  value: number;
}
export function activityHighlights(
  samples: Sample[],
  sport: Sport,
): ActivityHighlight[] {
  const edges = samples.slice(1).map((b, i) => {
    const a = samples[i]!;
    const seconds = (b.t - a.t) / 1000;
    const meters = distance(a, b);
    const valid =
      validSample(a) &&
      validSample(b) &&
      a.segment === b.segment &&
      seconds > 0 &&
      seconds <= 30 &&
      meters / seconds <= (sport === "ride" ? 35 : 12);
    return {
      valid,
      meters,
      seconds,
      gain:
        a.altitude !== undefined && b.altitude !== undefined
          ? Math.max(0, b.altitude - a.altitude)
          : 0,
    };
  });
  let fastest: ActivityHighlight | undefined;
  let climb: ActivityHighlight | undefined;
  let start = 0,
    meters = 0,
    seconds = 0,
    gain = 0;
  // A sustained 30+ second window rejects single-point GPS spikes.
  for (let end = 0; end < edges.length; end++) {
    const edge = edges[end]!;
    if (!edge.valid) {
      start = end + 1;
      meters = seconds = gain = 0;
      continue;
    }
    meters += edge.meters;
    seconds += edge.seconds;
    gain += edge.gain;
    while (start < end && seconds - edges[start]!.seconds >= 30) {
      meters -= edges[start]!.meters;
      seconds -= edges[start]!.seconds;
      gain -= edges[start]!.gain;
      start++;
    }
    if (seconds < 30) continue;
    const points = samples.slice(start, end + 2);
    if (!fastest || meters / seconds > fastest.value)
      fastest = {
        kind: "fastest",
        title: "Fastest stretch",
        points,
        value: meters / seconds,
      };
    if (gain >= 3 && (!climb || gain > climb.value))
      climb = { kind: "climb", title: "Biggest climb", points, value: gain };
  }
  const altitude = samples.filter(
    (p) =>
      validSample(p) && p.altitude !== undefined && Number.isFinite(p.altitude),
  );
  const highest = altitude.reduce<Sample | undefined>(
    (best, p) => (!best || p.altitude! > best.altitude! ? p : best),
    undefined,
  );
  return [
    fastest,
    climb,
    highest
      ? {
          kind: "highest" as const,
          title: "Highest point",
          points: [highest],
          value: highest.altitude!,
        }
      : undefined,
  ].filter((h): h is ActivityHighlight => !!h);
}

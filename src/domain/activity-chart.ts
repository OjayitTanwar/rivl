import type { Sample, Sport } from "./types";
import { distance, validSample } from "./geo";
export function paceChart(
  samples: Sample[],
  sport: Sport,
): { values: number[]; indices: number[] } {
  const values: number[] = [],
    indices: number[] = [],
    maximum = { run: 12, ride: 35, walk: 4, hike: 6 }[sport];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!,
      b = samples[i]!,
      seconds = (b.t - a.t) / 1000;
    if (
      !validSample(a) ||
      !validSample(b) ||
      a.segment !== b.segment ||
      seconds <= 0 ||
      seconds > 30
    )
      continue;
    const speed = distance(a, b) / seconds;
    if (speed < 0.35 || speed > maximum) continue;
    indices.push(i);
    values.push(1000 / speed);
  }
  return { values, indices };
}

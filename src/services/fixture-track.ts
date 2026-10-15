import type { Sample } from "../domain/types";
export function fixtureTrack(
  start: number,
  count = 601,
  variation = 0,
  pace = 310,
): Sample[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * Math.PI * 2,
      lat = 37.7694 + 0.01 * Math.cos(t) + 0.0015 * Math.sin(t * 3 + variation),
      lng = -122.469 + 0.018 * Math.sin(t) + 0.001 * Math.sin(t * 7);
    return {
      lat,
      lng,
      t: start + i * 5000,
      accuracy: 5,
      altitude: 38 + 15 * Math.sin(t * 2) + 6 * Math.sin(t * 5),
      hr: Math.round(137 + 12 * Math.sin(t * 0.6) + variation * 2),
      segment: 0,
    };
  }).map((p, i, all) => ({ ...p, t: start + (i * 5000 * pace) / 310 }));
}

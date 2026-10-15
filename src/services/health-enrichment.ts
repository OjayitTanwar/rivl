import type { Sample } from "../domain/types";
export function mergeHeartRate(
  samples: Sample[],
  heartRate: { t: number; hr: number }[],
): Sample[] {
  const hr = [...heartRate]
    .filter(
      (h) =>
        Number.isFinite(h.t) &&
        Number.isFinite(h.hr) &&
        h.hr >= 30 &&
        h.hr <= 240,
    )
    .sort((a, b) => a.t - b.t);
  let cursor = 0;
  return samples.map((p) => {
    while (cursor + 1 < hr.length && hr[cursor + 1]!.t <= p.t) cursor++;
    const a = hr[cursor],
      b = hr[cursor + 1],
      closest =
        a && b
          ? Math.abs(a.t - p.t) <= Math.abs(b.t - p.t)
            ? a
            : b
          : (a ?? b);
    return p.hr || !closest || Math.abs(closest.t - p.t) > 15000
      ? p
      : { ...p, hr: closest.hr };
  });
}

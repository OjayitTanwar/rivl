import type { Sample } from "./types";

export interface PowerBest {
  seconds: number;
  watts: number;
  start?: number;
  end?: number;
}
export const POWER_ZONE_LABELS = [
  "Recovery",
  "Endurance",
  "Tempo",
  "Threshold",
  "VO₂ max",
  "Anaerobic",
  "Sprint",
];
const ZONE_CEILINGS = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5];
/** Seconds in each FTP zone; missing readings and gaps over five seconds are excluded. */
export function powerZones(samples: Sample[], ftp: number): number[] {
  if (!Number.isFinite(ftp) || ftp < 50 || ftp > 1000)
    return Array(7).fill(0) as number[];
  const seconds = Array(7).fill(0) as number[];
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1]!,
      current = samples[i]!;
    const span = (current.t - previous.t) / 1000;
    if (
      !Number.isFinite(span) ||
      span <= 0 ||
      span > 5 ||
      previous.segment !== current.segment ||
      previous.watts === undefined ||
      !Number.isFinite(previous.watts) ||
      previous.watts < 0
    )
      continue;
    const ratio = previous.watts / ftp;
    const zone = ZONE_CEILINGS.findIndex((ceiling) => ratio < ceiling);
    seconds[zone < 0 ? 6 : zone]! += span;
  }
  return seconds;
}
export const POWER_WINDOWS = [1, 5, 30, 60, 300, 600, 1200, 1800, 3600, 7200];
/** Maximum rolling average for each duration, using only continuous measured power. */
export function powerCurve(samples: Sample[]): PowerBest[] {
  const bouts: { times: number[]; energy: number[]; watts: number[] }[] = [];
  let bout: (typeof bouts)[number] | null = null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!,
      b = samples[i]!,
      span = (b.t - a.t) / 1000;
    if (
      !Number.isFinite(span) ||
      span <= 0 ||
      span > 5 ||
      a.segment !== b.segment ||
      a.watts === undefined ||
      !Number.isFinite(a.watts) ||
      a.watts < 0
    ) {
      bout = null;
      continue;
    }
    if (!bout) {
      bout = { times: [a.t / 1000], energy: [0], watts: [] };
      bouts.push(bout);
    }
    bout.times.push(b.t / 1000);
    bout.watts.push(a.watts);
    bout.energy.push(bout.energy.at(-1)! + a.watts * span);
  }
  return POWER_WINDOWS.flatMap((seconds) => {
    let best: PowerBest | null = null;
    for (const b of bouts) {
      if (b.times.at(-1)! - b.times[0]! < seconds) continue;
      // A peak of the rolling piecewise-constant signal has either boundary at a sample time.
      let right = 0,
        left = 0;
      const consider = (start: number, end: number, energy: number) => {
        const watts = energy / seconds;
        if (!best || watts > best.watts)
          best = {
            seconds,
            watts,
            start: Math.round(start * 1000),
            end: Math.round(end * 1000),
          };
      };
      for (let i = 0; i < b.times.length; i++) {
        const start = b.times[i]!,
          end = start + seconds;
        if (end > b.times.at(-1)!) break;
        while (right + 1 < b.times.length && b.times[right + 1]! <= end)
          right++;
        const endEnergy =
          b.energy[right]! + (end - b.times[right]!) * (b.watts[right] ?? 0);
        consider(start, end, endEnergy - b.energy[i]!);
      }
      for (let i = 0; i < b.times.length; i++) {
        const end = b.times[i]!,
          start = end - seconds;
        if (start < b.times[0]!) continue;
        while (left + 1 < b.times.length && b.times[left + 1]! <= start) left++;
        const startEnergy =
          b.energy[left]! + (start - b.times[left]!) * (b.watts[left] ?? 0);
        consider(start, end, b.energy[i]! - startEnergy);
      }
    }
    const found = best as PowerBest | null;
    return found && found.watts > 0
      ? [{ ...found, watts: Math.round(found.watts) }]
      : [];
  });
}
export function powerDistribution(
  samples: Sample[],
): { watts: number; seconds: number }[] {
  const bins = new Map<number, number>();
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!,
      b = samples[i]!,
      span = (b.t - a.t) / 1000;
    if (
      !Number.isFinite(span) ||
      span <= 0 ||
      span > 5 ||
      a.segment !== b.segment ||
      a.watts === undefined ||
      !Number.isFinite(a.watts) ||
      a.watts < 0
    )
      continue;
    const bin = Math.floor(a.watts / 25) * 25;
    bins.set(bin, (bins.get(bin) ?? 0) + span);
  }
  return [...bins]
    .sort((a, b) => a[0] - b[0])
    .map(([watts, seconds]) => ({ watts, seconds }));
}
export function combinePowerCurves(curves: PowerBest[][]): PowerBest[] {
  return POWER_WINDOWS.flatMap((seconds) => {
    const values = curves.flatMap((curve) =>
      curve.filter((p) => p.seconds === seconds),
    );
    if (!values.length) return [];
    return [{ seconds, watts: Math.max(...values.map((p) => p.watts)) }];
  });
}

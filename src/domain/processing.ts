import type { Sample, Sport, Summary, Effort, Split } from "./types";
import { distance, validSample } from "./geo";
import {
  heartRateZone,
  isValidHeartRateZoneThresholds,
  type HeartRateZoneThresholds,
} from "./heart-rate-zones";
export const zone = heartRateZone;
export function processActivity(
  raw: Sample[],
  sport: Sport,
  startedAt: number,
  endedAt: number,
  maxHR = 190,
  rpe = 5,
  hrZoneThresholds?: HeartRateZoneThresholds | null,
): Summary {
  const effectiveMaxHR =
    Number.isFinite(maxHR) && maxHR >= 100 && maxHR <= 240 ? maxHR : 190;
  const boundaries = isValidHeartRateZoneThresholds(
    hrZoneThresholds,
    effectiveMaxHR,
  )
    ? ([...hrZoneThresholds] as HeartRateZoneThresholds)
    : undefined;
  const samples = [...raw].sort((a, b) => a.t - b.t),
    speeds = { run: 12, ride: 35, walk: 4, hike: 6 };
  let meters = 0,
    moving = 0,
    ascent = 0,
    descent = 0,
    hrSum = 0,
    hrTime = 0,
    powerSum = 0,
    powerTime = 0,
    max = 0,
    rejected = 0,
    previous: Sample | undefined,
    elevationAnchor: number | undefined;
  const zones = [0, 0, 0, 0, 0],
    track: { d: number; t: number; sample: number; continuity: number }[] = [
      { d: 0, t: 0, sample: 0, continuity: 0 },
    ],
    splits: Split[] = [];
  let splitStartTime = 0,
    splitStartDistance = 0,
    nextKm = 1000,
    splitAscent = 0,
    continuity = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    if (!validSample(p) || p.t < startedAt || p.t > endedAt) {
      rejected++;
      continue;
    }
    if (!previous) {
      previous = p;
      elevationAnchor = p.altitude;
      continue;
    }
    const dt = (p.t - previous.t) / 1000,
      d = distance(previous, p);
    if (dt <= 0) {
      rejected++;
      continue;
    }
    if (previous.segment !== p.segment || dt > 30) {
      previous = p;
      elevationAnchor = p.altitude;
      continuity++;
      track.push({ d: meters, t: moving, sample: i, continuity });
      continue;
    }
    if (d / dt > speeds[sport]) {
      rejected++;
      continue;
    }
    const threshold =
      sport === "ride" ? 1 : sport === "walk" || sport === "hike" ? 0.35 : 0.6;
    if (d / dt >= threshold) {
      const before = meters;
      meters += d;
      moving += dt;
      if (p.hr && p.hr >= 30 && p.hr <= 240) {
        hrSum += p.hr * dt;
        hrTime += dt;
        max = Math.max(max, p.hr);
        zones[zone(p.hr, effectiveMaxHR, boundaries)]! += dt;
      }
      if (p.watts !== undefined && p.watts >= 0) {
        powerSum += p.watts * dt;
        powerTime += dt;
      }
      if (p.altitude !== undefined && elevationAnchor !== undefined) {
        const change = p.altitude - elevationAnchor;
        if (Math.abs(change) >= 3) {
          if (change > 0) {
            ascent += change;
            splitAscent += change;
          } else descent -= change;
          elevationAnchor = p.altitude;
        }
      } else elevationAnchor = p.altitude;
      while (meters >= nextKm) {
        const crossing = moving - dt + (dt * (nextKm - before)) / d,
          seconds = crossing - splitStartTime;
        splits.push({
          km: splits.length + 1,
          distance: nextKm - splitStartDistance,
          seconds,
          pace: seconds,
          ascent: splitAscent,
        });
        splitAscent = 0;
        splitStartTime = crossing;
        splitStartDistance = nextKm;
        nextKm += 1000;
      }
      track.push({ d: meters, t: moving, sample: i, continuity });
    } else {
      continuity++;
    }
    previous = p;
  }
  if (meters - splitStartDistance > 1) {
    const d = meters - splitStartDistance,
      seconds = moving - splitStartTime;
    splits.push({
      km: splits.length + 1,
      distance: d,
      seconds,
      pace: (seconds / d) * 1000,
      ascent: splitAscent,
    });
  }
  const bests: Effort[] = [];
  for (const target of [400, 1000, 1609.344, 5000, 10000, 21097.5, 42195]) {
    if (meters < target) continue;
    let left = 0,
      best = Infinity,
      bs = 0,
      be = 0;
    for (let j = 1; j < track.length; j++) {
      const end = track[j]!,
        wanted = end.d - target;
      if (wanted < 0) continue;
      while (left + 1 < j && track[left + 1]!.d <= wanted) left++;
      const a = track[left]!,
        b = track[Math.min(left + 1, j)]!,
        fraction = (wanted - a.d) / (b.d - a.d || 1),
        time = end.t - (a.t + (b.t - a.t) * fraction);
      if (a.continuity === end.continuity && time < best && time > 0) {
        best = time;
        bs = a.sample;
        be = end.sample;
      }
    }
    if (Number.isFinite(best))
      bests.push({ distance: target, seconds: best, start: bs, end: be });
  }
  const useHR = hrTime >= moving * 0.5 && hrTime > 0,
    load = useHR
      ? zones.reduce((s, t, i) => s + (t / 60) * (i + 1), 0)
      : (moving / 60) * Math.max(1, Math.min(10, rpe)),
    avgPace = meters ? (moving / meters) * 1000 : 0;
  return {
    distance: meters,
    elapsed: Math.max(0, (endedAt - startedAt) / 1000),
    moving,
    ascent,
    descent,
    avgPace,
    avgSpeed: moving ? meters / moving : 0,
    avgHR: hrTime ? hrSum / hrTime : null,
    maxHR: max || null,
    avgPower: powerTime ? powerSum / powerTime : null,
    load,
    loadMethod: useHR ? "hr-zones" : "duration-rpe",
    zones,
    hrZoneMaxHR: effectiveMaxHR,
    ...(boundaries ? { hrZoneThresholds: boundaries } : {}),
    splits,
    bests,
    gap: meters && ascent > 0 ? avgPace / (1 + (ascent / meters) * 3.5) : null,
    rejected,
  };
}

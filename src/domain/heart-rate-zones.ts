export type HeartRateZoneThresholds = [number, number, number, number];

/** Four inclusive lower boundaries for zones 2–5, in beats per minute. */
export function isValidHeartRateZoneThresholds(
  value: unknown,
  maxHR = 240,
): value is HeartRateZoneThresholds {
  return (
    Number.isFinite(maxHR) &&
    maxHR >= 100 &&
    maxHR <= 240 &&
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (bpm, i) =>
        Number.isInteger(bpm) &&
        bpm >= 30 &&
        bpm <= maxHR &&
        (i === 0 || bpm > value[i - 1]),
    )
  );
}

export function defaultHeartRateZoneThresholds(
  maxHR = 190,
): HeartRateZoneThresholds {
  const maximum =
    Number.isFinite(maxHR) && maxHR >= 100 && maxHR <= 240 ? maxHR : 190;
  return [0.6, 0.7, 0.8, 0.9].map((ratio) =>
    Math.ceil(maximum * ratio),
  ) as HeartRateZoneThresholds;
}

export function heartRateZone(
  hr: number,
  maxHR = 190,
  thresholds?: HeartRateZoneThresholds | null,
): number {
  if (!Number.isFinite(hr)) return 0;
  const maximum =
    Number.isFinite(maxHR) && maxHR >= 100 && maxHR <= 240 ? maxHR : 190;
  if (isValidHeartRateZoneThresholds(thresholds, maximum))
    return thresholds.reduce(
      (index, boundary) => index + (hr >= boundary ? 1 : 0),
      0,
    );
  // Keep the existing default calculation for activities without personal boundaries.
  return Math.min(4, Math.max(0, Math.floor((hr / maximum - 0.5) * 10)));
}

export function heartRateZoneLabel(
  index: number,
  thresholds: HeartRateZoneThresholds,
): string {
  if (index === 0) return `Below ${thresholds[0]} bpm`;
  if (index === 4) return `${thresholds[3]}+ bpm`;
  return `${thresholds[index - 1]}–${thresholds[index]! - 1} bpm`;
}

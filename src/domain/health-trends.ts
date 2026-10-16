import type { WellnessEntry } from "./wellness";

/** Compare daily means from one HRV method; SDNN and RMSSD are not interchangeable. */
export function healthTrend(entries: WellnessEntry[], now = Date.now()) {
  const samples = entries
    .filter(
      (e) =>
        e.kind === "hrv" &&
        e.hrvMethod &&
        e.at <= now &&
        e.at >= now - 28 * 86400000 &&
        e.value > 0 &&
        Number.isFinite(e.value),
    )
    .sort((a, b) => b.at - a.at);
  const latest = samples[0];
  if (!latest)
    return {
      status: "missing" as const,
      text: "No HRV readings yet.",
      days: 0,
    };
  const days = new Map<string, { total: number; count: number }>();
  for (const sample of samples) {
    if (sample.hrvMethod !== latest.hrvMethod) continue;
    const d = new Date(sample.at),
      key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const previous = days.get(key) ?? { total: 0, count: 0 };
    days.set(key, {
      total: previous.total + sample.value,
      count: previous.count + 1,
    });
  }
  const averages = [...days.values()].map((d) => d.total / d.count),
    baseline = averages.slice(1);
  if (now - latest.at > 36 * 3600000)
    return {
      status: "stale" as const,
      text: "Refresh for a recent HRV reading.",
      days: baseline.length,
      latest,
    };
  if (baseline.length < 7)
    return {
      status: "building" as const,
      text: `${baseline.length}/7 baseline days recorded.`,
      days: baseline.length,
      latest,
    };
  const mean =
    baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
  const change = (averages[0]! / mean - 1) * 100;
  return {
    status: "ready" as const,
    text: `${change >= 0 ? "+" : ""}${Math.round(change)}% from your ${baseline.length}-day baseline`,
    days: baseline.length,
    latest,
    baseline: mean,
    change,
  };
}
export function healthRecordValue(entry: WellnessEntry) {
  if (entry.kind === "bloodPressure")
    return `${entry.value}/${entry.diastolic} mmHg`;
  if (entry.kind === "cycle")
    return (
      ["", "Spotting", "Light", "Medium", "Heavy"][entry.value] ??
      "Unknown flow"
    );
  if (entry.kind === "medication")
    return `${entry.medicationName} · ${entry.value} ${entry.doseUnit}`;
  if (entry.kind === "hrv") return `${entry.value} ms · ${entry.hrvMethod}`;
  return null;
}

import { AppFailure } from "../security/errors";
export const wellnessMetrics = {
  hrv: {
    label: "Heart-rate variability",
    unit: "ms",
    min: 1,
    max: 1000,
    whole: false,
  },
  bloodPressure: {
    label: "Blood pressure",
    unit: "mmHg",
    min: 40,
    max: 300,
    whole: true,
  },
  cycle: {
    label: "Menstrual flow",
    unit: "level",
    min: 1,
    max: 4,
    whole: true,
  },
  medication: {
    label: "Medication taken",
    unit: "dose",
    min: 0.001,
    max: 100000,
    whole: false,
  },
  sleep: { label: "Sleep", unit: "hours", min: 0.1, max: 24, whole: false },
  restingHR: {
    label: "Resting heart rate",
    unit: "bpm",
    min: 20,
    max: 250,
    whole: true,
  },
  steps: { label: "Steps", unit: "steps", min: 0, max: 150000, whole: true },
  floorsClimbed: {
    label: "Floors climbed",
    unit: "floors",
    min: 0,
    max: 10000,
    whole: false,
  },
  activeEnergy: {
    label: "Active energy",
    unit: "kcal",
    min: 0,
    max: 50000,
    whole: false,
  },
  weight: { label: "Weight", unit: "kg", min: 1, max: 500, whole: false },
  fasting: {
    label: "Fasting",
    unit: "hours",
    min: 0,
    max: 87600,
    whole: false,
  },
  water: { label: "Water intake", unit: "ml", min: 10, max: 5000, whole: true },
  bowel: {
    label: "Bowel movements",
    unit: "type",
    min: 1,
    max: 7,
    whole: true,
  },
} as const;
export type WellnessKind = keyof typeof wellnessMetrics;
export interface WellnessEntry {
  id: string;
  ownerId: string;
  kind: WellnessKind;
  value: number;
  at: number;
  note: string;
  startedAt?: number;
  diastolic?: number;
  medicationName?: string;
  doseUnit?: string;
  hrvMethod?: "SDNN" | "RMSSD";
  source?: {
    provider: "HealthKit" | "Health Connect";
    recordId: string;
    readAt: number;
    windowStart?: number;
    windowEnd?: number;
  };
}
export function wellnessUnit(
  entry: Pick<WellnessEntry, "kind" | "source">,
): string {
  return entry.kind === "floorsClimbed" &&
    entry.source?.provider === "HealthKit"
    ? "flights"
    : wellnessMetrics[entry.kind].unit;
}
export function isWellnessKind(value: string): value is WellnessKind {
  return Object.hasOwn(wellnessMetrics, value);
}
export function validateWellnessEntry(entry: WellnessEntry, now = Date.now()) {
  if (
    !entry.id ||
    entry.id.includes(":") ||
    !entry.ownerId ||
    !isWellnessKind(entry.kind)
  )
    throw new AppFailure("validation", "Choose a valid health record.");
  if (
    entry.kind === "bloodPressure" &&
    (!Number.isInteger(entry.diastolic) ||
      entry.diastolic! < 20 ||
      entry.diastolic! > 200 ||
      entry.diastolic! >= entry.value)
  )
    throw new AppFailure(
      "validation",
      "Enter a diastolic pressure of 20–200 mmHg below the systolic pressure.",
    );
  if (
    entry.kind === "medication" &&
    (!entry.medicationName?.trim() ||
      entry.medicationName.length > 100 ||
      !entry.doseUnit?.trim() ||
      entry.doseUnit.length > 30)
  )
    throw new AppFailure(
      "validation",
      "Enter a medication name and dose unit, such as mg or tablet.",
    );
  if (
    entry.kind === "hrv" &&
    !["SDNN", "RMSSD"].includes(entry.hrvMethod ?? "")
  )
    throw new AppFailure("validation", "Choose the HRV measurement method.");
  const metric = wellnessMetrics[entry.kind];
  if (
    !Number.isFinite(entry.value) ||
    entry.value < metric.min ||
    entry.value > metric.max ||
    (metric.whole && !Number.isInteger(entry.value))
  )
    throw new AppFailure(
      "validation",
      `Enter ${metric.min}–${metric.max} ${metric.unit}${metric.whole ? " as a whole number" : ""}.`,
    );
  if (!Number.isFinite(entry.at) || entry.at <= 0 || entry.at > now + 60000)
    throw new AppFailure("validation", "Choose a valid record time.");
  if (typeof entry.note !== "string" || entry.note.length > 500)
    throw new AppFailure("validation", "Keep notes under 500 characters.");
  if (
    entry.startedAt !== undefined &&
    (entry.kind !== "fasting" ||
      !Number.isFinite(entry.startedAt) ||
      entry.startedAt > entry.at ||
      entry.startedAt <= 0)
  )
    throw new AppFailure("validation", "The start must be before the finish.");
  if (
    entry.kind === "fasting" &&
    entry.startedAt !== undefined &&
    Math.abs(entry.value - (entry.at - entry.startedAt) / 3600000) > 0.000001
  )
    throw new AppFailure(
      "validation",
      "Fasting duration must match its start and finish times.",
    );
  if (
    entry.source &&
    (!["HealthKit", "Health Connect"].includes(entry.source.provider) ||
      typeof entry.source.recordId !== "string" ||
      !entry.source.recordId ||
      entry.source.recordId.length > 300 ||
      !Number.isFinite(entry.source.readAt) ||
      entry.source.readAt <= 0 ||
      entry.source.readAt > now + 60000 ||
      (entry.source.windowStart !== undefined &&
        (!Number.isFinite(entry.source.windowStart) ||
          entry.source.windowStart <= 0)) ||
      (entry.source.windowEnd !== undefined &&
        (!Number.isFinite(entry.source.windowEnd) ||
          entry.source.windowEnd > now + 60000 ||
          (entry.source.windowStart !== undefined &&
            entry.source.windowEnd <= entry.source.windowStart))))
  )
    throw new AppFailure(
      "validation",
      "The connected health record could not be read.",
    );
  return entry;
}
export function sameLocalDay(a: number, b: number) {
  const x = new Date(a),
    y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}
export function wellnessValue(
  entries: WellnessEntry[],
  kind: WellnessKind,
  now = Date.now(),
): number | null {
  const valid = entries
    .filter((e) => e.kind === kind && e.at <= now)
    .sort((a, b) => b.at - a.at);
  if (kind === "water" || kind === "bowel") {
    const today = valid.filter((e) => sameLocalDay(e.at, now));
    // Connected water and manual drinks can describe the same intake. Use the
    // connected stream when present rather than silently adding both sources.
    const connected = today.filter((e) => e.source);
    const waterRecords = connected.length ? connected : today;
    return kind === "bowel"
      ? today.length
      : waterRecords.reduce((sum, e) => sum + e.value, 0);
  }
  if (kind === "steps" || kind === "floorsClimbed" || kind === "activeEnergy")
    return valid.find((e) => sameLocalDay(e.at, now))?.value ?? null;
  return valid[0]?.value ?? null;
}

/** Calendar validation rejects silently rolled dates, including DST gaps. */
export function parseWellnessLocalTime(text: string, now = Date.now()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
  if (!match)
    throw new AppFailure("validation", "Enter the time as YYYY-MM-DD HH:mm.");
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    year < 1970 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getTime() <= 0 ||
    date.getTime() > now + 60000
  )
    throw new AppFailure(
      "validation",
      "Choose a valid calendar date and time that is not in the future.",
    );
  return date.getTime();
}
export function formatWellnessLocalTime(at: number): string {
  const date = new Date(at),
    pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

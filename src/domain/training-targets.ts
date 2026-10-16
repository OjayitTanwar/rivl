import { AppFailure } from "../security/errors";
export type TrainingTarget =
  | { kind: "pace"; min: number; max: number }
  | { kind: "heartRate"; min: number; max: number }
  | { kind: "power"; min: number; max: number }
  | { kind: "strength"; min: number; max: number };
const limits = {
  pace: [120, 1800],
  heartRate: [30, 250],
  power: [1, 2500],
  strength: [1, 100],
} as const;
export function validateTrainingTarget(target: TrainingTarget): TrainingTarget {
  const range = target && limits[target.kind];
  if (
    !range ||
    !Number.isInteger(target.min) ||
    !Number.isInteger(target.max) ||
    target.min < range[0] ||
    target.max > range[1] ||
    target.min > target.max
  )
    throw new AppFailure(
      "validation",
      "Enter an ordered target range within the displayed limits.",
    );
  return { kind: target.kind, min: target.min, max: target.max };
}
export function formatTrainingTarget(target: TrainingTarget) {
  const checked = validateTrainingTarget(target);
  const pace = (v: number) =>
    `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  return checked.kind === "pace"
    ? `${pace(checked.min)}–${pace(checked.max)} /km`
    : `${checked.min}–${checked.max} ${checked.kind === "heartRate" ? "bpm" : checked.kind === "power" ? "W" : "reps per work interval"}`;
}

/** Pace is entered as minutes:seconds; other targets use whole units. */
export function trainingTargetInput(
  kind: TrainingTarget["kind"],
  value: number,
): string {
  return kind === "pace"
    ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`
    : String(value);
}
export function parseTrainingTargetInput(
  kind: TrainingTarget["kind"],
  value: string,
): number {
  if (kind !== "pace") return /^\d+$/.test(value) ? Number(value) : NaN;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

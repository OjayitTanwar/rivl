import {
  type TrainingHistory,
  type TrainingPlan,
  validateTrainingPlan,
} from "./guided-training";
export type TrainingSuggestion = {
  kind: "insufficient" | "hold" | "reduce" | "progress";
  message: string;
  workSec: number;
  evidence: number;
};
/** A transparent duration suggestion, not a readiness diagnosis. Never mutates a plan. */
export function suggestTrainingAdjustment(
  plan: TrainingPlan,
  history: TrainingHistory[],
  now = Date.now(),
): TrainingSuggestion {
  validateTrainingPlan(plan);
  const recent = history
    .filter(
      (h) =>
        h.session.ownerId === plan.ownerId &&
        h.session.plan.id === plan.id &&
        h.session.plan.ownerId === plan.ownerId &&
        h.completed &&
        h.session.skipped === 0 &&
        [
          "sport",
          "workSec",
          "warmupSec",
          "recoverySec",
          "repeats",
          "cooldownSec",
        ].every(
          (key) =>
            h.session.plan[key as keyof TrainingPlan] ===
            plan[key as keyof TrainingPlan],
        ) &&
        JSON.stringify(h.session.plan.target) === JSON.stringify(plan.target) &&
        h.endedAt <= now &&
        h.endedAt >= now - 28 * 86400000 &&
        h.feedback &&
        Number.isInteger(h.feedback.effort) &&
        h.feedback.effort >= 1 &&
        h.feedback.effort <= 10 &&
        ["ready", "tired", "sore"].includes(h.feedback.recovery),
    )
    .sort((a, b) => b.endedAt - a.endedAt)
    .filter(
      (h, i, all) => all.findIndex((x) => x.session.id === h.session.id) === i,
    )
    .slice(0, 3);
  const result = (
    kind: TrainingSuggestion["kind"],
    message: string,
    workSec = plan.workSec,
  ): TrainingSuggestion => ({
    kind,
    message,
    workSec,
    evidence: recent.length,
  });
  if (!recent.length)
    return result(
      "insufficient",
      "Log effort and recovery after a session to see a suggestion.",
    );
  if (
    recent[0]!.feedback!.recovery !== "ready" ||
    recent[0]!.feedback!.effort >= 8
  )
    return result(
      "reduce",
      "Latest feedback suggests easing work time by 10%.",
      Math.max(1, Math.floor(plan.workSec * 0.9)),
    );
  if (recent.length < 3)
    return result(
      "insufficient",
      "Three recent sessions with feedback are needed before suggesting an increase.",
    );
  const eligible = recent.every(
    (h) =>
      h.completed &&
      h.session.skipped === 0 &&
      h.feedback!.recovery === "ready" &&
      h.feedback!.effort <= 6 &&
      h.session.plan.workSec === plan.workSec,
  );
  if (!eligible)
    return result(
      "hold",
      "Keep work time steady based on your recent feedback.",
    );
  const workSec = Math.min(
    3600,
    Math.max(plan.workSec + 1, Math.round(plan.workSec * 1.05)),
  );
  try {
    validateTrainingPlan({ ...plan, workSec });
  } catch {
    return result(
      "hold",
      "Keep work time steady; this plan is at its duration limit.",
    );
  }
  return result(
    workSec > plan.workSec ? "progress" : "hold",
    workSec > plan.workSec
      ? "Three comfortable, unskipped sessions: consider 5% more work time."
      : "Work time is at its limit.",
    workSec,
  );
}

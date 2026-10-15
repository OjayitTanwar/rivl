import { AppFailure } from "../security/errors";
import { validateTrainingPlan, type TrainingPlan } from "./guided-training";
import {
  validateCreatorProgram,
  type CreatorProgram,
} from "./creator-training";

export type ProgressionOptions = {
  weeks: number;
  sessionsPerWeek: number;
  weeklyPercent: number;
  feedback: "comfortable" | "repeat" | "reduce";
};
/** An explicit duration schedule, never an inferred fitness or injury assessment.
 * Recovery weeks reduce work; the following block resumes its prior baseline.
 */
export function buildTrainingProgression(
  plan: TrainingPlan,
  options: ProgressionOptions,
  identity: { id: string; creatorName: string; now: number },
): CreatorProgram {
  validateTrainingPlan(plan);
  const { weeks, sessionsPerWeek, weeklyPercent, feedback } = options;
  if (
    !Number.isInteger(weeks) ||
    weeks < 2 ||
    weeks > 12 ||
    !Number.isInteger(sessionsPerWeek) ||
    sessionsPerWeek < 1 ||
    sessionsPerWeek > 4 ||
    ![0, 5, 10].includes(weeklyPercent) ||
    !["comfortable", "repeat", "reduce"].includes(feedback)
  )
    throw new AppFailure(
      "validation",
      "Choose 2–12 weeks, 1–4 sessions and 0%, 5% or 10% progression.",
    );
  const initial = feedback === "reduce" ? 0.9 : 1;
  const growth = feedback === "comfortable" ? weeklyPercent / 100 : 0;
  const sessions: CreatorProgram["sessions"] = [];
  for (let week = 1; week <= weeks; week++) {
    const recovery = week % 4 === 0;
    const buildWeeks = week - 1 - Math.floor((week - 1) / 4);
    const multiplier =
      initial *
      Math.pow(1 + growth, buildWeeks - (recovery ? 1 : 0)) *
      (recovery ? 0.8 : 1);
    const workSec = Math.min(
      3600,
      Math.max(1, Math.round(plan.workSec * multiplier)),
    );
    for (let index = 0; index < sessionsPerWeek; index++) {
      sessions.push({
        id: `week-${week}-session-${index + 1}`,
        week,
        day: 1 + Math.floor((index * 7) / sessionsPerWeek),
        title: `${recovery ? "Recovery" : "Week " + week} · session ${index + 1}`,
        notes: `Work duration ${workSec}s per repetition. ${recovery ? "Recovery week: work reduced by 20%." : "Warm up, recovery and repetitions match your base plan."} Move or edit sessions to fit your recovery.`,
        workout: {
          warmupSec: plan.warmupSec,
          workSec,
          recoverySec: plan.recoverySec,
          repeats: plan.repeats,
          cooldownSec: plan.cooldownSec,
        },
      });
    }
  }
  return validateCreatorProgram({
    id: identity.id,
    ownerId: plan.ownerId,
    creatorName: identity.creatorName,
    title: `${plan.title.slice(0, 70)} · ${weeks} weeks`,
    description: `User-controlled progression from ${plan.title}. Feedback: ${feedback}. Work interval grows ${growth * 100}% in build weeks, capped at 3,600 seconds. Every fourth week reduces work by 20%. This schedule does not infer fitness from GPS or heart rate. Review every session before starting.`,
    sport: plan.sport,
    level: "all",
    weeks,
    revision: 1,
    updatedAt: identity.now,
    license: "CC-BY-4.0",
    sessions,
  });
}

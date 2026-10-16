import {
  validateTrainingTarget,
  type TrainingTarget,
} from "./training-targets";
import { AppFailure } from "../security/errors";
export const trainingSports = ["run", "ride", "walk", "hike"] as const;
export type TrainingSport = (typeof trainingSports)[number];
export type TrainingPlan = {
  id: string;
  ownerId: string;
  title: string;
  sport: TrainingSport;
  warmupSec: number;
  workSec: number;
  recoverySec: number;
  repeats: number;
  cooldownSec: number;
  updatedAt: number;
  target?: TrainingTarget;
};
export type TrainingStage = {
  label: string;
  seconds: number;
  kind: "warmup" | "work" | "recovery" | "cooldown";
};
export type TrainingSession = {
  id: string;
  ownerId: string;
  plan: TrainingPlan;
  stages: TrainingStage[];
  startedAt: number;
  anchorAt: number;
  elapsedMs: number;
  skipped: number;
  state: "running" | "paused";
};
export type TrainingHistory = {
  session: TrainingSession;
  endedAt: number;
  elapsedMs: number;
  completed: boolean;
  feedback?: { effort: number; recovery: "ready" | "tired" | "sore" };
};
const invalid = (message: string): never => {
  throw new AppFailure("validation", message);
};
export function validateTrainingPlan(plan: TrainingPlan): TrainingPlan {
  if (
    !plan ||
    typeof plan.id !== "string" ||
    !plan.id ||
    plan.id.includes(":") ||
    typeof plan.ownerId !== "string" ||
    !plan.ownerId ||
    plan.ownerId.includes(":")
  )
    invalid("Sign in to save a training session.");
  if (
    typeof plan.title !== "string" ||
    !plan.title.trim() ||
    plan.title.length > 100 ||
    !trainingSports.includes(plan.sport)
  )
    invalid("Enter a session name and choose a sport.");
  for (const key of [
    "warmupSec",
    "workSec",
    "recoverySec",
    "cooldownSec",
  ] as const)
    if (
      !Number.isSafeInteger(plan[key]) ||
      plan[key] < (key === "workSec" ? 1 : 0) ||
      plan[key] > 3600
    )
      invalid(
        "Use whole seconds up to 3,600 for each interval. Work must be at least one second.",
      );
  if (
    !Number.isSafeInteger(plan.repeats) ||
    plan.repeats < 1 ||
    plan.repeats > 50
  )
    invalid("Choose between 1 and 50 repetitions.");
  if (
    plan.warmupSec +
      plan.workSec * plan.repeats +
      plan.recoverySec * (plan.repeats - 1) +
      plan.cooldownSec >
    86400
  )
    invalid("Keep an interval session within 24 hours.");
  if (!Number.isFinite(plan.updatedAt) || plan.updatedAt <= 0)
    invalid("Choose a valid session date.");
  if (plan.target !== undefined) validateTrainingTarget(plan.target);
  return plan;
}
export function trainingStages(plan: TrainingPlan): TrainingStage[] {
  validateTrainingPlan(plan);
  const stages: TrainingStage[] = [];
  if (plan.warmupSec)
    stages.push({ label: "Warm up", seconds: plan.warmupSec, kind: "warmup" });
  for (let i = 0; i < plan.repeats; i++) {
    stages.push({
      label: `Work ${i + 1} of ${plan.repeats}`,
      seconds: plan.workSec,
      kind: "work",
    });
    if (plan.recoverySec && i < plan.repeats - 1)
      stages.push({
        label: `Recovery ${i + 1} of ${plan.repeats - 1}`,
        seconds: plan.recoverySec,
        kind: "recovery",
      });
  }
  if (plan.cooldownSec)
    stages.push({
      label: "Cool down",
      seconds: plan.cooldownSec,
      kind: "cooldown",
    });
  return stages;
}
export function trainingDuration(stages: TrainingStage[]) {
  return stages.reduce((sum, stage) => sum + stage.seconds, 0);
}
export function validateTrainingSession(
  session: TrainingSession,
): TrainingSession {
  if (
    !session ||
    typeof session.id !== "string" ||
    !session.id ||
    session.id.includes(":") ||
    session.ownerId !== session.plan?.ownerId
  )
    invalid(
      "This interval session cannot be read. End it before starting another.",
    );
  validateTrainingPlan(session.plan);
  if (
    !Number.isSafeInteger(session.skipped) ||
    session.skipped < 0 ||
    session.skipped > session.stages.length ||
    !["running", "paused"].includes(session.state) ||
    !Number.isFinite(session.startedAt) ||
    session.startedAt <= 0 ||
    !Number.isFinite(session.anchorAt) ||
    session.anchorAt <= 0 ||
    !Number.isFinite(session.elapsedMs) ||
    session.elapsedMs < 0 ||
    session.elapsedMs > trainingDuration(trainingStages(session.plan)) * 1000 ||
    JSON.stringify(session.stages) !==
      JSON.stringify(trainingStages(session.plan))
  )
    invalid(
      "This interval session cannot be read. End it before starting another.",
    );
  return session;
}
export function trainingPosition(session: TrainingSession, now = Date.now()) {
  validateTrainingSession(session);
  const totalMs = trainingDuration(session.stages) * 1000,
    clockRollback = session.state === "running" && now < session.anchorAt;
  const elapsedMs = Math.min(
    totalMs,
    session.elapsedMs +
      (session.state === "running" ? Math.max(0, now - session.anchorAt) : 0),
  );
  let startMs = 0;
  for (let index = 0; index < session.stages.length; index++) {
    const stage = session.stages[index]!;
    if (elapsedMs < startMs + stage.seconds * 1000)
      return {
        index,
        stage,
        elapsedMs,
        remainingSec: Math.ceil(
          (startMs + stage.seconds * 1000 - elapsedMs) / 1000,
        ),
        totalMs,
        complete: false,
        clockRollback,
      };
    startMs += stage.seconds * 1000;
  }
  return {
    index: session.stages.length,
    stage: null,
    elapsedMs,
    remainingSec: 0,
    totalMs,
    complete: true,
    clockRollback,
  };
}
export function formatTrainingDuration(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

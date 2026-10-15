import { describe, expect, it } from "vitest";
import { buildTrainingProgression } from "../src/domain/training-progression";
import type { TrainingPlan } from "../src/domain/guided-training";
const plan: TrainingPlan = {
  id: "base",
  ownerId: "owner",
  title: "Intervals",
  sport: "run",
  warmupSec: 300,
  workSec: 100,
  recoverySec: 60,
  repeats: 3,
  cooldownSec: 300,
  updatedAt: 1000,
};
const identity = { id: "program", creatorName: "You", now: 1000 };
const options = {
  weeks: 8,
  sessionsPerWeek: 3,
  weeklyPercent: 10,
  feedback: "comfortable" as const,
};
describe("explicit training progression", () => {
  it("schedules separated days and recovery weeks without changing the base", () => {
    const result = buildTrainingProgression(plan, options, identity);
    expect(result.sessions).toHaveLength(24);
    expect(result.sessions.slice(0, 3).map((s) => s.day)).toEqual([1, 3, 5]);
    expect(
      result.sessions.filter((s) => s.week === 4)[0]?.workout.workSec,
    ).toBe(97);
    expect(
      result.sessions.filter((s) => s.week === 5)[0]?.workout.workSec,
    ).toBe(133);
    expect(result.sessions[0]?.workout.recoverySec).toBe(60);
    expect(plan.workSec).toBe(100);
    expect(result.ownerId).toBe("owner");
    expect(result.revision).toBe(1);
  });
  it("holds or reduces duration when feedback does not request progression", () => {
    expect(
      buildTrainingProgression(
        plan,
        { ...options, feedback: "repeat" },
        identity,
      ).sessions[18]?.workout.workSec,
    ).toBe(100);
    expect(
      buildTrainingProgression(
        plan,
        { ...options, feedback: "reduce" },
        identity,
      ).sessions[18]?.workout.workSec,
    ).toBe(90);
  });
  it("caps per-stage work and rejects whole-session overflow", () => {
    expect(
      buildTrainingProgression({ ...plan, workSec: 3500 }, options, identity)
        .sessions[18]?.workout.workSec,
    ).toBe(3600);
    expect(() =>
      buildTrainingProgression(
        {
          ...plan,
          workSec: 1500,
          recoverySec: 0,
          warmupSec: 0,
          cooldownSec: 0,
          repeats: 50,
        },
        options,
        identity,
      ),
    ).toThrow("24 hours");
  });
  it("rejects unbounded and invalid options instead of producing partial programs", () => {
    for (const bad of [
      { weeks: 13 },
      { weeks: NaN },
      { sessionsPerWeek: 5 },
      { weeklyPercent: 100 },
      { feedback: "automatic" },
    ])
      expect(() =>
        buildTrainingProgression(
          plan,
          { ...options, ...bad } as typeof options,
          identity,
        ),
      ).toThrow();
  });
});

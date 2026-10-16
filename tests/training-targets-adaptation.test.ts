import { describe, expect, it } from "vitest";
import {
  validateTrainingTarget,
  formatTrainingTarget,
  parseTrainingTargetInput,
  trainingTargetInput,
  type TrainingTarget,
} from "../src/domain/training-targets";
import { suggestTrainingAdjustment } from "../src/domain/training-adaptation";
import { TRAINING_STARTERS } from "../src/domain/training-starters";
import {
  encodeCreatorProgram,
  decodeCreatorProgram,
  creatorSessionPlan,
} from "../src/domain/creator-training";
import { TrainingRepository } from "../src/services/training-repository";
import { CreatorTrainingRepository } from "../src/services/creator-training-repository";
import { MemoryDatabase } from "../src/storage/port";
import {
  trainingStages,
  type TrainingPlan,
  type TrainingHistory,
} from "../src/domain/guided-training";
const now = 1800000000000;
const plan: TrainingPlan = {
  id: "p",
  ownerId: "me",
  title: "Intervals",
  sport: "run",
  warmupSec: 10,
  workSec: 100,
  recoverySec: 30,
  repeats: 3,
  cooldownSec: 10,
  updatedAt: now,
};
function history(
  id: string,
  patch: Partial<TrainingHistory> = {},
): TrainingHistory {
  return {
    session: {
      id,
      ownerId: "me",
      plan: structuredClone(plan),
      stages: trainingStages(plan),
      startedAt: now - 500000,
      anchorAt: now - 500000,
      elapsedMs: 0,
      skipped: 0,
      state: "running",
    },
    endedAt: now - 1000,
    elapsedMs: 380000,
    completed: true,
    feedback: { effort: 5, recovery: "ready" },
    ...patch,
  };
}
describe("training targets", () => {
  it.each([
    ["pace", 120, 1800],
    ["heartRate", 30, 250],
    ["power", 1, 2500],
    ["strength", 1, 100],
  ] as const)("bounds %s and rejects malformed values", (kind, min, max) => {
    expect(validateTrainingTarget({ kind, min, max })).toEqual({
      kind,
      min,
      max,
    });
    for (const target of [
      { kind, min: min - 1, max },
      { kind, min, max: max + 1 },
      { kind, min: max, max: min },
      { kind, min: NaN, max },
      { kind, min: Infinity, max },
      { kind, min: min + 0.5, max },
      null,
      { kind: "unknown", min, max },
    ])
      expect(() => validateTrainingTarget(target as TrainingTarget)).toThrow();
  });
  it("round trips usable pace entry without accepting seconds overflow", () => {
    expect(trainingTargetInput("pace", 305)).toBe("5:05");
    expect(parseTrainingTargetInput("pace", "5:05")).toBe(305);
    for (const value of ["5:60", "305", "5:5", "-1:00", "5:00oops"])
      expect(parseTrainingTargetInput("pace", value)).toBeNaN();
    expect(formatTrainingTarget({ kind: "pace", min: 300, max: 360 })).toBe(
      "5:00–6:00 /km",
    );
  });
  it.each(["pace", "heartRate", "power", "strength"] as const)(
    "preserves %s through creator export, import and session plan",
    (kind) => {
      const target = {
        kind,
        min: kind === "pace" ? 300 : 50,
        max: kind === "pace" ? 360 : 60,
      } as TrainingTarget;
      const starter = structuredClone(TRAINING_STARTERS[0]!);
      starter.sessions[0]!.workout.target = target;
      const program = { ...starter, id: "local", ownerId: "me" };
      const decoded = decodeCreatorProgram(encodeCreatorProgram(program));
      expect(decoded.sessions[0]!.workout.target).toEqual(target);
      const local = { ...decoded, id: "imported", ownerId: "other" };
      expect(
        creatorSessionPlan(local, decoded.sessions[0]!.id, "other", "plan", now)
          .target,
      ).toEqual(target);
    },
  );
});
describe("explicit training suggestions", () => {
  it("does not mutate or save plans and requires three distinct completed sessions", () => {
    const before = structuredClone(plan),
      h = history("one");
    expect(suggestTrainingAdjustment(plan, [h, h, h], now).kind).toBe(
      "insufficient",
    );
    expect(
      suggestTrainingAdjustment(
        plan,
        [h, history("two"), history("three")],
        now,
      ),
    ).toMatchObject({ kind: "progress", workSec: 105, evidence: 3 });
    expect(plan).toEqual(before);
  });
  it("ignores stale, future, foreign, aborted, skipped and changed-plan evidence", () => {
    const stale = history("stale", { endedAt: now - 29 * 86400000 }),
      future = history("future", { endedAt: now + 1 }),
      foreign = history("foreign"),
      changed = history("changed"),
      skipped = history("skipped"),
      aborted = history("aborted", {
        completed: false,
        feedback: { effort: 10, recovery: "sore" },
      });
    foreign.session.ownerId = "other";
    changed.session.plan.workSec = 90;
    skipped.session.skipped = 1;
    expect(
      suggestTrainingAdjustment(
        plan,
        [stale, future, foreign, changed, skipped, aborted],
        now,
      ),
    ).toMatchObject({ kind: "insufficient", evidence: 0 });
  });
  it("reduces from valid recent difficult feedback; invalid feedback cannot progress", () => {
    expect(
      suggestTrainingAdjustment(
        plan,
        [history("hard", { feedback: { effort: 9, recovery: "tired" } })],
        now,
      ),
    ).toMatchObject({ kind: "reduce", workSec: 90 });
    expect(
      suggestTrainingAdjustment(
        plan,
        [history("bad", { feedback: { effort: NaN, recovery: "ready" } })],
        now,
      ).evidence,
    ).toBe(0);
  });
});
describe("training feedback persistence", () => {
  it("does not apply a suggestion until the reviewed plan is explicitly saved", async () => {
    const db = new MemoryDatabase();
    await db.set("session", { userId: "me" });
    const repo = new TrainingRepository(db);
    await repo.save(plan, null);
    const suggestion = suggestTrainingAdjustment(
      plan,
      [history("a"), history("b"), history("c")],
      now,
    );
    expect((await repo.plans("me"))[0]!.workSec).toBe(100);
    await repo.save(
      { ...plan, workSec: suggestion.workSec, updatedAt: now + 1 },
      plan,
    );
    expect((await repo.plans("me"))[0]!.workSec).toBe(105);
    await expect(repo.save({ ...plan, workSec: 110 }, plan)).rejects.toThrow(
      "changed",
    );
  });
  it("serializes feedback between repository instances, snapshots input and refuses foreign accounts", async () => {
    const db = new MemoryDatabase();
    await db.set("session", { userId: "me" });
    await db.set("guided-training:me:history:one", history("one"));
    const a = new TrainingRepository(db),
      b = new TrainingRepository(db),
      feedback = { effort: 3, recovery: "ready" as const };
    const first = a.feedback("me", "one", feedback);
    feedback.effort = 10;
    await Promise.all([
      first,
      b.feedback("me", "one", { effort: 7, recovery: "tired" }),
    ]);
    expect((await a.history("me"))[0]!.feedback).toEqual({
      effort: 7,
      recovery: "tired",
    });
    await expect(
      a.feedback("me", "missing", { effort: 5, recovery: "ready" }),
    ).rejects.toThrow("no longer available");
    await expect(
      a.feedback("me", "one", { effort: 0, recovery: "ready" }),
    ).rejects.toThrow("1–10");
    await db.set("session", { userId: "other" });
    await expect(
      a.feedback("me", "one", { effort: 2, recovery: "ready" }),
    ).rejects.toThrow("account changed");
    expect((await a.history("me"))[0]!.feedback!.effort).toBe(7);
  });
  it("ships original CC0 editable starters that import without creating interval plans", async () => {
    const db = new MemoryDatabase();
    await db.set("session", { userId: "me" });
    const repo = new CreatorTrainingRepository(db);
    for (const starter of TRAINING_STARTERS) {
      expect(starter.license).toBe("CC0-1.0");
      expect(starter.creatorName).toBe("RIVL");
      expect(starter.sessions).toHaveLength(4);
      const decoded = decodeCreatorProgram(
        encodeCreatorProgram({ ...starter, id: "source", ownerId: "source" }),
      );
      expect(decoded.sport).toBe(starter.sport);
      const adopted = await repo.adopt(
        "me",
        decoded,
        `import-${starter.sport}`,
        now,
      );
      expect(adopted.origin).toMatchObject({
        license: "CC0-1.0",
        creatorName: "RIVL",
      });
      expect(
        creatorSessionPlan(
          adopted,
          adopted.sessions[0]!.id,
          "me",
          `plan-${starter.sport}`,
          now,
        ).sport,
      ).toBe(starter.sport);
    }
    expect(await new TrainingRepository(db).plans("me")).toEqual([]);
  });
});

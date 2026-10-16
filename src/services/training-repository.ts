import type { Database } from "../storage/port";
import { AppFailure } from "../security/errors";
import {
  validateTrainingPlan,
  validateTrainingSession,
  trainingStages,
  trainingPosition,
  type TrainingPlan,
  type TrainingSession,
  type TrainingHistory,
} from "../domain/guided-training";
const queues = new WeakMap<Database, Map<string, Promise<unknown>>>();
const copyPlan = (plan: TrainingPlan) => ({
  ...plan,
  ...(plan.target ? { target: { ...plan.target } } : {}),
});
export class TrainingRepository {
  constructor(
    private db: Database,
    private now = Date.now,
  ) {}
  private prefix(owner: string) {
    if (!owner || owner.includes(":"))
      throw new AppFailure("auth", "Sign in to keep your guided training.");
    return `guided-training:${owner}:`;
  }
  private sessionKey(owner: string) {
    this.prefix(owner);
    return `guided-session:${owner}`;
  }
  private mutate<T>(owner: string, work: () => Promise<T>) {
    this.prefix(owner);
    let owners = queues.get(this.db);
    if (!owners) queues.set(this.db, (owners = new Map()));
    const next = (owners.get(owner) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    owners.set(owner, next);
    void next
      .finally(() => {
        if (owners!.get(owner) === next) owners!.delete(owner);
      })
      .catch(() => {});
    return next;
  }
  private async auth(owner: string) {
    if (
      (await this.db.get<{ userId: string }>("session"))?.userId !== owner ||
      (await this.db.get<{ userId: string }>("account:cleanup"))?.userId ===
        owner
    )
      throw new AppFailure(
        "auth",
        "Your account changed. Reopen Guided training.",
      );
  }
  async plans(owner: string) {
    return (await this.db.list<TrainingPlan>(this.prefix(owner) + "plan:"))
      .filter((p) => p.ownerId === owner)
      .map(validateTrainingPlan)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  async history(owner: string) {
    return (
      await this.db.list<TrainingHistory>(this.prefix(owner) + "history:")
    )
      .filter((h) => h.session.ownerId === owner)
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, 100);
  }
  async active(owner: string) {
    const session = await this.db.get<TrainingSession>(this.sessionKey(owner));
    if (session && session.ownerId !== owner)
      throw new AppFailure(
        "validation",
        "This interval session belongs to another account.",
      );
    return session ? validateTrainingSession(session) : null;
  }
  save(plan: TrainingPlan, expected: TrainingPlan | null) {
    const next = copyPlan(plan),
      previous = expected ? copyPlan(expected) : null;
    return this.mutate(next.ownerId, async () => {
      validateTrainingPlan(next);
      const key = this.prefix(next.ownerId) + "plan:" + next.id;
      if (JSON.stringify(await this.db.get(key)) !== JSON.stringify(previous))
        throw new AppFailure(
          "validation",
          "This plan changed. Reload before saving.",
        );
      if (previous === null && (await this.plans(next.ownerId)).length >= 100)
        throw new AppFailure(
          "validation",
          "You have 100 saved plans. Delete an unused plan before adding another.",
        );
      await this.auth(next.ownerId);
      await this.db.set(key, next);
    });
  }
  remove(plan: TrainingPlan) {
    const previous = copyPlan(plan);
    return this.mutate(previous.ownerId, async () => {
      validateTrainingPlan(previous);
      const key = this.prefix(previous.ownerId) + "plan:" + previous.id;
      if (JSON.stringify(await this.db.get(key)) !== JSON.stringify(previous))
        throw new AppFailure(
          "validation",
          "This plan changed. Reload before deleting.",
        );
      await this.auth(previous.ownerId);
      await this.db.remove(key);
    });
  }
  start(owner: string, plan: TrainingPlan, id: string) {
    const snapshot = copyPlan(plan);
    return this.mutate(owner, async () => {
      validateTrainingPlan(snapshot);
      if (snapshot.ownerId !== owner || !id || id.includes(":"))
        throw new AppFailure("validation", "Choose a valid training plan.");
      if (await this.active(owner))
        throw new AppFailure(
          "validation",
          "An interval session is already active. Resume or end it first.",
        );
      const now = this.now(),
        session: TrainingSession = {
          id,
          ownerId: owner,
          plan: snapshot,
          stages: trainingStages(snapshot),
          startedAt: now,
          anchorAt: now,
          elapsedMs: 0,
          skipped: 0,
          state: "running",
        };
      validateTrainingSession(session);
      await this.auth(owner);
      await this.db.set(this.sessionKey(owner), session);
      return session;
    });
  }
  transition(
    owner: string,
    id: string,
    action: "pause" | "resume" | "skip" | "end" | "complete",
  ) {
    return this.mutate(owner, async () => {
      const session = await this.active(owner);
      if (!session || session.id !== id)
        throw new AppFailure(
          "validation",
          "This interval session changed. Reload it before continuing.",
        );
      const now = this.now(),
        position = trainingPosition(session, now);
      if (position.clockRollback && action !== "end" && action !== "pause")
        throw new AppFailure(
          "validation",
          "The device clock moved backwards. Pause tracking until the clock is corrected, or end this interval session.",
        );
      let elapsedMs = position.elapsedMs;
      if (action === "skip" && !position.complete) session.skipped++;
      if (action === "complete" && !position.complete)
        throw new AppFailure(
          "validation",
          "This interval session has not finished yet.",
        );
      if (action === "skip" && !position.complete)
        elapsedMs = session.stages
          .slice(0, position.index + 1)
          .reduce((sum, s) => sum + s.seconds * 1000, 0);
      const finished =
        action === "end" ||
        action === "complete" ||
        elapsedMs >= position.totalMs;
      await this.auth(owner);
      if (finished) {
        const history: TrainingHistory = {
          session,
          endedAt: now,
          elapsedMs,
          completed: action !== "end" && elapsedMs >= position.totalMs,
        };
        const removeKeys = [this.sessionKey(owner)];
        const previous = await this.history(owner);
        for (const old of previous.slice(99))
          removeKeys.push(this.prefix(owner) + "history:" + old.session.id);
        await this.auth(owner);
        await this.db.commit(
          { [this.prefix(owner) + "history:" + id]: history },
          removeKeys,
        );
        return null;
      }
      const state =
        action === "pause"
          ? "paused"
          : action === "resume"
            ? "running"
            : session.state;
      // Repeated pause/resume calls are idempotent and never restart elapsed time.
      const next = {
        ...session,
        elapsedMs,
        anchorAt: now,
        state,
      } satisfies TrainingSession;
      await this.db.set(this.sessionKey(owner), next);
      return next;
    });
  }
  feedback(
    owner: string,
    sessionId: string,
    feedback: NonNullable<TrainingHistory["feedback"]>,
  ) {
    const next = { ...feedback };
    return this.mutate(owner, async () => {
      if (
        !Number.isInteger(next.effort) ||
        next.effort < 1 ||
        next.effort > 10 ||
        !["ready", "tired", "sore"].includes(next.recovery)
      )
        throw new AppFailure(
          "validation",
          "Choose effort from 1–10 and your recovery.",
        );
      const item = (await this.history(owner)).find(
        (h) => h.session.id === sessionId,
      );
      if (!item)
        throw new AppFailure(
          "validation",
          "This session is no longer available.",
        );
      await this.auth(owner);
      await this.db.set(this.prefix(owner) + "history:" + sessionId, {
        ...item,
        feedback: next,
      });
    });
  }
  clearTimer(owner: string) {
    return this.mutate(owner, async () => {
      await this.auth(owner);
      await this.db.remove(this.sessionKey(owner));
    });
  }
  purge(owner: string) {
    return this.mutate(owner, () =>
      (async () => {
        await this.db.removePrefix(this.prefix(owner));
        await this.db.remove(this.sessionKey(owner));
      })(),
    );
  }
}

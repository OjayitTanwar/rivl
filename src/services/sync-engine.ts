import { userMessage } from "../security/errors";
import type { Activity, Sample } from "../domain/types";
import type { Database } from "../storage/port";
export interface ActivityRemote {
  upload(activity: Activity, samples: Sample[]): Promise<void>;
  pull(
    ownerId: string,
    since: number,
  ): Promise<Activity[] | { activities: Activity[]; cursor: number }>;
}
export interface QueueItem {
  id: string;
  ownerId: string;
  revision: number;
  attempts: number;
  nextAttempt: number;
  lastError?: string;
}
export class SyncEngine {
  private running = false;
  constructor(
    private db: Database,
    private remote: ActivityRemote,
  ) {}
  async enqueue(a: Activity, additionalValues: Record<string, unknown> = {}) {
    if (a.demo || a.simulated) {
      await this.db.set("activity:" + a.ownerId + ":" + a.id, {
        ...a,
        sync: "local",
      });
      await this.db.remove("outbox:" + a.ownerId + ":" + a.id);
      return;
    }
    await this.db.commit({
      ...additionalValues,
      ["activity:" + a.ownerId + ":" + a.id]: a,
      ["outbox:" + a.ownerId + ":" + a.id]: {
        id: a.id,
        ownerId: a.ownerId,
        revision: a.revision,
        attempts: 0,
        nextAttempt: 0,
      },
    });
  }
  async reconcile(ownerId: string) {
    const activities = await this.db.list<Activity>(
      "activity:" + ownerId + ":",
    );
    for (const a of activities)
      if (a.sync === "pending" || a.sync === "error") {
        const key = "outbox:" + ownerId + ":" + a.id;
        if (!(await this.db.get(key)))
          await this.db.set<QueueItem>(key, {
            id: a.id,
            ownerId,
            revision: a.revision,
            attempts: 0,
            nextAttempt: 0,
          });
      }
  }
  async run(ownerId: string, now = Date.now(), force = false) {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcile(ownerId);
      const queue = await this.db.list<QueueItem>("outbox:" + ownerId + ":");
      for (const q of queue) {
        if (!force && q.nextAttempt > now) continue;
        const key = "activity:" + ownerId + ":" + q.id,
          a = await this.db.get<Activity>(key);
        if (!a) {
          await this.db.remove("outbox:" + ownerId + ":" + q.id);
          continue;
        }
        if (a.demo || a.simulated) {
          await this.enqueue(a);
          continue;
        }
        try {
          await this.remote.upload(a, await this.db.samples(q.id));
          const latest = await this.db.get<Activity>(key);
          if (latest?.revision === a.revision) {
            await this.db.set(key, { ...latest, sync: "synced" });
            await this.db.remove("outbox:" + ownerId + ":" + q.id);
          }
        } catch (error) {
          await this.db.set("outbox:" + ownerId + ":" + q.id, {
            ...q,
            attempts: q.attempts + 1,
            nextAttempt:
              now + Math.min(3600000, 1000 * 2 ** Math.min(q.attempts, 12)),
            lastError: userMessage(error),
          });
          const latest = await this.db.get<Activity>(key);
          if (latest?.revision === a.revision)
            await this.db.set(key, { ...latest, sync: "error" });
        }
      }
      const since = (await this.db.get<number>("cursor:" + ownerId)) ?? 0;
      try {
        const result = await this.remote.pull(ownerId, since);
        const pulled = Array.isArray(result) ? result : result.activities;
        for (const a of pulled) {
          if (a.ownerId !== ownerId) continue;
          const key = "activity:" + ownerId + ":" + a.id,
            local = await this.db.get<Activity>(key);
          if (
            !local ||
            (local.sync === "synced" && local.revision <= a.revision)
          ) {
            const localPhotos =
              local?.photos.filter((p) => !/^https?:/.test(p)) ?? [];
            const localNames = new Set(
              localPhotos.map((p) => p.split("/").at(-1)),
            );
            await this.db.set(key, {
              ...a,
              // A cloud snapshot must not discard device-local photo files.
              photos: [
                ...new Set([
                  ...localPhotos,
                  ...a.photos.filter(
                    (_, index) =>
                      !localNames.has(a.photoKeys?.[index]?.split("/").at(-1)),
                  ),
                ]),
              ],
              sync: "synced",
            });
          }
        }
        await this.db.set(
          "cursor:" + ownerId,
          Array.isArray(result) ? now : result.cursor,
        );
      } catch {
        /* keep cursor for retry */
      }
    } finally {
      this.running = false;
    }
  }
}
export class DevelopmentRemote implements ActivityRemote {
  async upload() {
    throw new Error(
      "Cloud sync is not configured. Your activity is safe on this device.",
    );
  }
  async pull() {
    return [];
  }
}

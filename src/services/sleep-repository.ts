import type { Database } from "../storage/port";
import {
  validateSleepRead,
  type SleepHistoryRead,
} from "../domain/sleep-analysis";
const queues = new WeakMap<Database, Map<string, Promise<unknown>>>();
export class SleepRepository {
  constructor(
    private db: Database,
    private now = Date.now,
  ) {}
  private key(owner: string) {
    if (!owner || owner.includes(":")) throw Error("Invalid owner");
    return "sleep-history:" + owner;
  }
  private mutate<T>(owner: string, work: () => Promise<T>) {
    let owners = queues.get(this.db);
    if (!owners) queues.set(this.db, (owners = new Map()));
    const result = (owners.get(owner) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    owners.set(owner, result);
    void result
      .finally(() => {
        if (owners!.get(owner) === result) owners!.delete(owner);
      })
      .catch(() => {});
    return result;
  }
  async read(owner: string): Promise<SleepHistoryRead | null> {
    const read = await this.db.get<SleepHistoryRead>(this.key(owner));
    return read ? validateSleepRead(read, this.now()) : null;
  }
  async replace(
    owner: string,
    read: SleepHistoryRead,
    canCommit: () => boolean = () => true,
  ) {
    validateSleepRead(read, this.now());
    const next = { ...read, intervals: read.intervals.map((r) => ({ ...r })) };
    return this.mutate(owner, async () => {
      if (
        !canCommit() ||
        (await this.db.get<{ userId: string }>("account:cleanup"))?.userId ===
          owner ||
        (await this.db.get<{ userId: string }>("session"))?.userId !== owner ||
        !(await this.db.get("health:" + owner))
      )
        return false;
      const old = await this.db.get<SleepHistoryRead>(this.key(owner));
      if (old && old.readAt > next.readAt) return false;
      await this.db.set(this.key(owner), next);
      return true;
    });
  }
  async purge(owner: string) {
    return this.mutate(owner, () => this.db.remove(this.key(owner)));
  }
}

import { AppFailure } from "../security/errors";
import type { Database } from "../storage/port";
import { validateWellnessEntry, type WellnessEntry } from "../domain/wellness";

// All repository instances sharing a database use the same per-owner mutation queue.
const queues = new WeakMap<Database, Map<string, Promise<unknown>>>();
export class WellnessRepository {
  constructor(
    private db: Database,
    private now = Date.now,
  ) {}
  private prefix(ownerId: string) {
    if (!ownerId || ownerId.includes(":"))
      throw new AppFailure("validation", "Sign in to save health records.");
    return `wellness:${ownerId}:`;
  }
  private key(ownerId: string, id: string) {
    if (!id || id.includes(":"))
      throw new AppFailure("validation", "Choose a valid record.");
    return this.prefix(ownerId) + id;
  }
  private mutate<T>(
    ownerId: string,
    action: () => Promise<T>,
    allowCleanup = false,
  ): Promise<T> {
    this.prefix(ownerId);
    let owners = queues.get(this.db);
    if (!owners) queues.set(this.db, (owners = new Map()));
    const result = (owners.get(ownerId) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (
          !allowCleanup &&
          (await this.db.get<{ userId: string }>("account:cleanup"))?.userId ===
            ownerId
        )
          throw new AppFailure("auth", "This account is being removed.");
        return action();
      });
    owners.set(ownerId, result);
    void result
      .finally(() => {
        if (owners.get(ownerId) === result) owners.delete(ownerId);
      })
      .catch(() => {});
    return result;
  }
  async list(ownerId: string) {
    return (await this.db.list<WellnessEntry>(this.prefix(ownerId)))
      .filter((e) => e.ownerId === ownerId)
      .map((e) => validateWellnessEntry(e, this.now()))
      .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  }
  // expected=null creates a record, expected=entry edits that exact revision.
  async save(entry: WellnessEntry, expected?: WellnessEntry | null) {
    const next = { ...entry };
    const previousVersion = expected ? { ...expected } : expected;
    return this.mutate(next.ownerId, async () => {
      validateWellnessEntry(next, this.now());
      const key = this.key(next.ownerId, next.id);
      if (expected !== undefined) {
        const previous = await this.db.get<WellnessEntry>(key);
        if (JSON.stringify(previous) !== JSON.stringify(previousVersion))
          throw new AppFailure(
            "validation",
            "This record changed. Reload the history before saving.",
          );
      }
      await this.db.set(key, next);
    });
  }
  async remove(ownerId: string, id: string, expected?: WellnessEntry) {
    const key = this.key(ownerId, id);
    return this.mutate(ownerId, async () => {
      if (
        expected !== undefined &&
        JSON.stringify(await this.db.get(key)) !== JSON.stringify(expected)
      )
        throw new AppFailure(
          "validation",
          "This record changed. Reload the history before deleting.",
        );
      await this.db.remove(key);
    });
  }
  /** One atomic, queued replacement of canonical imported records; manual entries are untouched. */
  async importHealth(
    ownerId: string,
    entries: WellnessEntry[],
    canCommit: () => boolean = () => true,
    waterWindow?: {
      provider: "HealthKit" | "Health Connect";
      from: number;
      to: number;
      readAt: number;
    },
  ) {
    const next = entries.map((entry) => ({
      ...entry,
      source: entry.source ? { ...entry.source } : undefined,
    }));
    return this.mutate(ownerId, async () => {
      if (
        !canCommit() ||
        (await this.db.get<{ userId: string }>("session"))?.userId !==
          ownerId ||
        !(await this.db.get(`health:${ownerId}`))
      )
        return 0;
      const values: Record<string, WellnessEntry> = {};
      for (const entry of next) {
        validateWellnessEntry(entry, this.now());
        if (
          entry.ownerId !== ownerId ||
          !entry.source ||
          !entry.id.startsWith("health-")
        )
          throw new AppFailure(
            "validation",
            "Choose a valid connected health record.",
          );
        const key = this.key(ownerId, entry.id),
          previous = await this.db.get<WellnessEntry>(key);
        if (
          previous &&
          (!previous.source ||
            previous.source.provider !== entry.source.provider ||
            previous.source.readAt > entry.source.readAt)
        )
          continue;
        values[key] = entry;
      }
      if (
        !canCommit() ||
        (await this.db.get<{ userId: string }>("session"))?.userId !==
          ownerId ||
        !(await this.db.get(`health:${ownerId}`))
      )
        return 0;
      const removeKeys: string[] = [];
      if (waterWindow) {
        for (const previous of await this.db.list<WellnessEntry>(
          this.prefix(ownerId),
        )) {
          const key = this.key(ownerId, previous.id);
          if (
            previous.kind === "water" &&
            previous.source?.provider === waterWindow.provider &&
            previous.source.readAt <= waterWindow.readAt &&
            previous.at >= waterWindow.from &&
            previous.at <= waterWindow.to &&
            !values[key]
          )
            removeKeys.push(key);
        }
      }
      if (
        !canCommit() ||
        !(await this.db.get(`health:${ownerId}`)) ||
        (await this.db.get<{ userId: string }>("session"))?.userId !== ownerId
      )
        return 0;
      await this.db.commit(values, removeKeys);
      return Object.keys(values).length;
    });
  }
  async purge(ownerId: string) {
    return this.mutate(
      ownerId,
      async () => {
        await this.db.removePrefix(this.prefix(ownerId));
        await this.db.remove(`wellness-fast:${ownerId}`);
      },
      true,
    );
  }
  async activeFast(ownerId: string) {
    this.prefix(ownerId);
    const start = await this.db.get<number>(`wellness-fast:${ownerId}`);
    if (start !== null && (!Number.isFinite(start) || start <= 0))
      throw new AppFailure(
        "validation",
        "The fasting timer could not be read. Cancel it to start again.",
      );
    return start;
  }
  async startFast(ownerId: string) {
    return this.mutate(ownerId, async () => {
      if ((await this.activeFast(ownerId)) !== null)
        throw new AppFailure(
          "validation",
          "A fasting timer is already running.",
        );
      await this.db.set(`wellness-fast:${ownerId}`, this.now());
    });
  }
  async finishFast(ownerId: string, id: string) {
    const key = this.key(ownerId, id);
    return this.mutate(ownerId, async () => {
      const start = await this.activeFast(ownerId),
        end = this.now();
      if (start === null || end < start)
        throw new AppFailure(
          "validation",
          "No running timer can be finished at this time. Check the device clock or cancel the timer.",
        );
      if (await this.db.get(key))
        throw new AppFailure(
          "validation",
          "This fasting record already exists. Reload the history.",
        );
      const entry: WellnessEntry = {
        id,
        ownerId,
        kind: "fasting",
        value: (end - start) / 3600000,
        at: end,
        note: "",
        startedAt: start,
      };
      validateWellnessEntry(entry, end);
      await this.db.commit({ [key]: entry }, [`wellness-fast:${ownerId}`]);
    });
  }
  async cancelFast(ownerId: string) {
    return this.mutate(ownerId, () =>
      this.db.remove(`wellness-fast:${ownerId}`),
    );
  }
}

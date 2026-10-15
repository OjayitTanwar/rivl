import type { Database } from "../storage/port";
import type { PreparedTrackEvidence } from "../domain/community-tracks";
import { AppFailure } from "../security/errors";
export interface TrackMappingSettings {
  enabled: boolean;
  revision: number;
  syncedRevision: number;
  remoteRevision?: number;
  deleteGeneration: number;
  syncedDeleteGeneration: number;
}
export interface TrackContributionDraft {
  activityId: string;
  sourceRevision: number;
  origin: "device-gps" | "watch-gps";
  state: "pending" | "submitted" | "withdraw";
  attempts: number;
  retryAt: number;
  updatedAt: number;
  collectedPreferenceRevision?: number;
  collectedRemotePreferenceRevision?: number;
  collectedDeleteGeneration?: number;
}
export interface CommunityTrackPort {
  preference(): Promise<{ enabled: boolean; revision: number }>;
  setPreference(
    enabled: boolean,
  ): Promise<{ enabled: boolean; revision: number }>;
  submit(
    activityId: string,
    sourceRevision: number,
    origin: TrackContributionDraft["origin"],
    preferenceRevision: number,
  ): Promise<void>;
  withdraw(activityId: string): Promise<void>;
  deleteAll(): Promise<void>;
}
const queues = new WeakMap<Database, Map<string, Promise<unknown>>>();
const syncQueues = new WeakMap<Database, Map<string, Promise<unknown>>>();
const defaults = (): TrackMappingSettings => ({
  enabled: true,
  revision: 0,
  syncedRevision: -1,
  deleteGeneration: 0,
  syncedDeleteGeneration: 0,
});
export class CommunityTrackRepository {
  constructor(
    private db: Database,
    private now = Date.now,
  ) {}
  private key(owner: string) {
    if (!owner || owner.includes(":")) throw Error("Invalid owner");
    return "track-mapping:" + owner;
  }
  private prefix(owner: string) {
    this.key(owner);
    return "track-contribution:" + owner + ":";
  }
  private mutate<T>(
    owner: string,
    work: () => Promise<T>,
    allowCleanup = false,
  ): Promise<T> {
    this.key(owner);
    let owners = queues.get(this.db);
    if (!owners) queues.set(this.db, (owners = new Map()));
    const result = (owners.get(owner) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (
          !allowCleanup &&
          (await this.db.get<{ userId: string }>("account:cleanup"))?.userId ===
            owner
        )
          throw new AppFailure("auth", "This account is being removed.");
        return work();
      });
    owners.set(owner, result);
    void result
      .finally(() => {
        if (owners!.get(owner) === result) owners!.delete(owner);
      })
      .catch(() => {});
    return result;
  }
  async settings(owner: string): Promise<TrackMappingSettings> {
    return (
      (await this.db.get<TrackMappingSettings>(this.key(owner))) ?? defaults()
    );
  }
  async list(owner: string) {
    return (
      await this.db.list<TrackContributionDraft>(this.prefix(owner))
    ).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  private async capacity(owner: string) {
    const entries = await this.list(owner);
    if (entries.length < 200) return true;
    const oldest = [...entries].reverse().find((d) => d.state === "submitted");
    if (!oldest) return false;
    // Acknowledged history is a bounded recent view. Server source-change/delete
    // triggers retain lifecycle correctness after old local receipts are pruned.
    await this.db.remove(this.prefix(owner) + oldest.activityId);
    return true;
  }
  async prepareUpdateForCommit(owner: string, evidence: PreparedTrackEvidence) {
    const old = await this.db.get<TrackContributionDraft>(
      this.prefix(owner) + evidence.sourceActivityId,
    );
    if (!old || old.state === "withdraw") return {};
    return this.prepareForCommit(owner, evidence);
  }
  async updateRevision(owner: string, evidence: PreparedTrackEvidence) {
    return this.mutate(owner, async () => {
      const writes = await this.prepareUpdateForCommit(owner, evidence);
      if (Object.keys(writes).length) await this.db.commit(writes);
    });
  }
  async prepareForCommit(
    owner: string,
    evidence: PreparedTrackEvidence,
  ): Promise<Record<string, unknown>> {
    const s = await this.settings(owner),
      id = evidence.sourceActivityId;
    if (
      !s.enabled ||
      !id ||
      id.includes(":") ||
      evidence.algorithmVersion !== "gps-track-evidence-v1" ||
      !Number.isSafeInteger(evidence.sourceRevision) ||
      evidence.sourceRevision < 1 ||
      !["device-gps", "watch-gps"].includes(evidence.origin) ||
      !evidence.lines.length
    )
      return {};
    const key = this.prefix(owner) + id,
      old = await this.db.get<TrackContributionDraft>(key);
    if (old && old.sourceRevision >= evidence.sourceRevision) return {};
    if (!old && !(await this.capacity(owner))) return {};
    return {
      [key]: {
        activityId: id,
        sourceRevision: evidence.sourceRevision,
        origin: evidence.origin,
        state: "pending",
        attempts: 0,
        retryAt: 0,
        updatedAt: this.now(),
        collectedPreferenceRevision: s.revision,
        collectedRemotePreferenceRevision:
          s.syncedRevision === s.revision ? s.remoteRevision : undefined,
        collectedDeleteGeneration: s.deleteGeneration,
      },
    };
  }
  async setEnabled(owner: string, enabled: boolean) {
    return this.mutate(owner, async () => {
      const s = await this.settings(owner),
        next = { ...s, enabled, revision: s.revision + 1 };
      const writes: Record<string, unknown> = { [this.key(owner)]: next };
      if (!enabled)
        for (const d of await this.list(owner))
          if (d.state === "pending")
            writes[this.prefix(owner) + d.activityId] = {
              ...d,
              state: "withdraw",
              attempts: 0,
              retryAt: 0,
            };
      await this.db.commit(writes);
      return next;
    });
  }
  async enqueue(owner: string, evidence: PreparedTrackEvidence) {
    const input = {
      activityId: evidence.sourceActivityId,
      sourceRevision: evidence.sourceRevision,
      origin: evidence.origin,
    };
    if (
      !input.activityId ||
      input.activityId.includes(":") ||
      !Number.isSafeInteger(input.sourceRevision) ||
      input.sourceRevision < 1 ||
      !["device-gps", "watch-gps"].includes(input.origin) ||
      evidence.algorithmVersion !== "gps-track-evidence-v1" ||
      !evidence.lines.length
    )
      return false;
    return this.mutate(owner, async () => {
      if (!(await this.settings(owner)).enabled) return false;
      const settings = await this.settings(owner);
      const key = this.prefix(owner) + input.activityId,
        old = await this.db.get<TrackContributionDraft>(key);
      if (old && old.sourceRevision >= input.sourceRevision) return false;
      if (!old && !(await this.capacity(owner))) return false;
      await this.db.set<TrackContributionDraft>(key, {
        ...input,
        state: "pending",
        attempts: 0,
        retryAt: 0,
        updatedAt: this.now(),
        collectedPreferenceRevision: settings.revision,
        collectedRemotePreferenceRevision:
          settings.syncedRevision === settings.revision
            ? settings.remoteRevision
            : undefined,
        collectedDeleteGeneration: settings.deleteGeneration,
      });
      return true;
    });
  }
  async withdraw(owner: string, activityId: string) {
    if (!activityId || activityId.includes(":")) return;
    return this.mutate(owner, async () => {
      const key = this.prefix(owner) + activityId,
        old = await this.db.get<TrackContributionDraft>(key);
      await this.db.set<TrackContributionDraft>(key, {
        activityId,
        sourceRevision: old?.sourceRevision ?? 1,
        origin: old?.origin ?? "device-gps",
        state: "withdraw",
        attempts: 0,
        retryAt: 0,
        updatedAt: this.now(),
      });
    });
  }
  async deletePrevious(owner: string) {
    return this.mutate(owner, async () => {
      const s = await this.settings(owner);
      await this.db.commit(
        {
          [this.key(owner)]: { ...s, deleteGeneration: s.deleteGeneration + 1 },
        },
        (await this.list(owner)).map((d) => this.prefix(owner) + d.activityId),
      );
    });
  }
  /** Network waits never hold local locks: disabling/deletion remains immediate. */
  async flush(
    owner: string,
    port: CommunityTrackPort,
    canCommit: () => boolean = () => true,
  ) {
    this.key(owner);
    let owners = syncQueues.get(this.db);
    if (!owners) syncQueues.set(this.db, (owners = new Map()));
    const result = (owners.get(owner) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.flushOnce(owner, port, canCommit));
    owners.set(owner, result);
    void result
      .finally(() => {
        if (owners!.get(owner) === result) owners!.delete(owner);
      })
      .catch(() => {});
    return result;
  }
  private async flushOnce(
    owner: string,
    port: CommunityTrackPort,
    canCommit: () => boolean,
  ) {
    if (!canCommit()) return;
    let local = await this.settings(owner);
    const remote =
      local.revision === 0
        ? await port.preference()
        : local.syncedRevision !== local.revision
          ? await port.setPreference(local.enabled)
          : await port.preference();
    if (remote)
      await this.mutate(owner, async () => {
        const current = await this.settings(owner);
        if (canCommit() && current.revision === local.revision)
          await this.db.set(this.key(owner), {
            ...current,
            enabled: remote.enabled,
            remoteRevision: remote.revision,
            syncedRevision: current.revision,
          });
      });
    local = await this.settings(owner);
    if (!canCommit()) return;
    if (local.deleteGeneration !== local.syncedDeleteGeneration) {
      const generation = local.deleteGeneration;
      await port.deleteAll();
      await this.mutate(owner, async () => {
        const s = await this.settings(owner);
        if (canCommit())
          await this.db.set(this.key(owner), {
            ...s,
            syncedDeleteGeneration: generation,
          });
      });
    }
    for (const d of (await this.list(owner))
      .filter((d) => d.state !== "submitted" && d.retryAt <= this.now())
      .slice(0, 10)) {
      const settings = await this.settings(owner);
      if (!canCommit()) return;
      if (
        d.state === "pending" &&
        (!settings.enabled ||
          (d.collectedRemotePreferenceRevision !== undefined &&
            d.collectedRemotePreferenceRevision !== settings.remoteRevision))
      ) {
        await this.withdraw(owner, d.activityId);
        continue;
      }
      if (
        d.state === "pending" &&
        (!settings.enabled ||
          settings.syncedRevision !== settings.revision ||
          !settings.remoteRevision)
      )
        continue;
      if (
        d.state === "pending" &&
        (d.collectedPreferenceRevision !== settings.revision ||
          d.collectedDeleteGeneration !== settings.deleteGeneration)
      ) {
        await this.withdraw(owner, d.activityId);
        continue;
      }
      try {
        if (d.state === "withdraw") await port.withdraw(d.activityId);
        else
          await port.submit(
            d.activityId,
            d.sourceRevision,
            d.origin,
            settings.remoteRevision!,
          );
        await this.mutate(owner, async () => {
          const key = this.prefix(owner) + d.activityId,
            current = await this.db.get<TrackContributionDraft>(key),
            s = await this.settings(owner);
          if (!canCommit() || JSON.stringify(current) !== JSON.stringify(d)) {
            if (canCommit() && !current && d.state === "pending")
              await this.db.set(key, { ...d, state: "withdraw", retryAt: 0 });
            return;
          }
          if (d.state === "withdraw") await this.db.remove(key);
          else
            await this.db.set(key, {
              ...d,
              state:
                s.enabled &&
                s.revision === settings.revision &&
                s.deleteGeneration === settings.deleteGeneration
                  ? "submitted"
                  : "withdraw",
              attempts: 0,
              retryAt: 0,
            });
        });
      } catch {
        await this.mutate(owner, async () => {
          const key = this.prefix(owner) + d.activityId,
            current = await this.db.get<TrackContributionDraft>(key);
          if (!canCommit() || JSON.stringify(current) !== JSON.stringify(d))
            return;
          const attempts = Math.min(20, d.attempts + 1);
          await this.db.set(key, {
            ...d,
            attempts,
            retryAt:
              this.now() +
              Math.min(86400000, 30000 * 2 ** Math.min(attempts - 1, 12)),
          });
        });
      }
    }
  }
  async purge(owner: string) {
    return this.mutate(
      owner,
      async () => {
        await this.db.removePrefix(this.prefix(owner));
        await this.db.remove(this.key(owner));
      },
      true,
    );
  }
}

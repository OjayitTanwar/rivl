import type { Database } from "../storage/port";
import type { Activity } from "../domain/types";
import {
  gearTypeForSport,
  validGear,
  type Gear,
  type GearAssignment,
} from "../domain/gear";
export class GearRepository {
  constructor(private db: Database) {}
  private pending: Promise<void> = Promise.resolve();
  private prefix(ownerId: string) {
    if (!ownerId || ownerId.includes(":"))
      throw new Error("Sign in to manage gear.");
    return `gear:${ownerId}:`;
  }
  async list(ownerId: string) {
    return (await this.db.list<Gear>(this.prefix(ownerId)))
      .filter((g) => g.ownerId === ownerId)
      .sort(
        (a, b) =>
          Number(a.retired) - Number(b.retired) || b.addedAt - a.addedAt,
      );
  }
  async assignments(ownerId: string) {
    this.prefix(ownerId);
    return (
      await this.db.list<GearAssignment>(`gear-activity:${ownerId}:`)
    ).filter((a) => a.ownerId === ownerId);
  }
  save(input: Gear) {
    const next = this.pending.then(() => this.saveExclusive(input));
    this.pending = next.catch(() => {});
    return next;
  }
  private async saveExclusive(input: Gear) {
    const gear = validGear(input),
      values: Record<string, Gear> = {};
    if (gear.isDefault)
      for (const previous of await this.list(gear.ownerId))
        if (
          previous.type === gear.type &&
          previous.id !== gear.id &&
          previous.isDefault
        )
          values[this.prefix(gear.ownerId) + previous.id] = {
            ...previous,
            isDefault: false,
          };
    values[this.prefix(gear.ownerId) + gear.id] = gear;
    await this.db.commit(values);
  }
  async assign(activity: Activity, gearId: string | null) {
    const prefix = this.prefix(activity.ownerId);
    if (activity.demo || activity.simulated)
      throw new Error("Gear tracks real activities only.");
    const key = `gear-activity:${activity.ownerId}:${activity.id}`;
    if (!gearId) {
      await this.db.remove(key);
      return;
    }
    if (gearId.includes(":")) throw new Error("Choose valid gear.");
    const gear = await this.db.get<Gear>(prefix + gearId);
    if (
      !gear ||
      gear.ownerId !== activity.ownerId ||
      gear.type !== gearTypeForSport(activity.sport)
    )
      throw new Error("Choose compatible gear from your account.");
    const existing = await this.db.get<GearAssignment>(key);
    if (gear.retired && existing?.gearId !== gearId)
      throw new Error("Restore this gear before assigning a new activity.");
    await this.db.set<GearAssignment>(key, {
      ownerId: activity.ownerId,
      activityId: activity.id,
      gearId,
    });
  }
  async assignDefault(activity: Activity) {
    if (activity.demo || activity.simulated) return;
    if (await this.db.get(`gear-activity:${activity.ownerId}:${activity.id}`))
      return;
    const gear = (await this.list(activity.ownerId)).find(
      (g) =>
        g.isDefault &&
        !g.retired &&
        g.type === gearTypeForSport(activity.sport),
    );
    if (gear) await this.assign(activity, gear.id);
  }
}

import type { Database } from "../storage/port";
import {
  validateNutritionEntry,
  type NutritionEntry,
} from "../domain/nutrition";
import { AppFailure } from "../security/errors";
const queues = new WeakMap<Database, Map<string, Promise<unknown>>>();
export class NutritionRepository {
  constructor(private db: Database) {}
  private prefix(owner: string) {
    if (!owner || owner.includes(":"))
      throw new AppFailure("validation", "Sign in to keep your meal diary.");
    return `nutrition:${owner}:`;
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
  async list(owner: string) {
    return (await this.db.list<NutritionEntry>(this.prefix(owner)))
      .filter((e) => e.ownerId === owner)
      .map(validateNutritionEntry)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  private async assertOwner(owner: string) {
    if (
      (await this.db.get<{ userId: string }>("session"))?.userId !== owner ||
      (await this.db.get<{ userId: string }>("account:cleanup"))?.userId ===
        owner
    )
      throw new AppFailure(
        "auth",
        "Your account changed. Reopen Nutrition before saving.",
      );
  }
  async save(entry: NutritionEntry, expected: NutritionEntry | null) {
    const next = {
        ...entry,
        food: { ...entry.food, per100g: { ...entry.food.per100g } },
      },
      previous = expected
        ? {
            ...expected,
            food: { ...expected.food, per100g: { ...expected.food.per100g } },
          }
        : null;
    return this.mutate(next.ownerId, async () => {
      validateNutritionEntry(next);
      const key = this.prefix(next.ownerId) + next.id;
      if (JSON.stringify(await this.db.get(key)) !== JSON.stringify(previous))
        throw new AppFailure(
          "validation",
          "This meal changed. Reload before saving.",
        );
      await this.assertOwner(next.ownerId);
      await this.db.set(key, next);
    });
  }
  async remove(entry: NutritionEntry) {
    const previous = {
      ...entry,
      food: { ...entry.food, per100g: { ...entry.food.per100g } },
    };
    return this.mutate(previous.ownerId, async () => {
      validateNutritionEntry(previous);
      const key = this.prefix(previous.ownerId) + previous.id;
      if (JSON.stringify(await this.db.get(key)) !== JSON.stringify(previous))
        throw new AppFailure(
          "validation",
          "This meal changed. Reload before deleting.",
        );
      await this.assertOwner(previous.ownerId);
      await this.db.remove(key);
    });
  }
  purge(owner: string) {
    return this.mutate(owner, () => this.db.removePrefix(this.prefix(owner)));
  }
}

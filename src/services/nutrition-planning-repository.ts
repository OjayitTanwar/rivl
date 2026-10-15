import type { Database } from "../storage/port";
import { AppFailure } from "../security/errors";
import {
  validatePlanningOwner,
  validateNutritionGoals,
  validateNutritionRecipe,
  validatePlannedMeal,
  type NutritionGoals,
  type NutritionRecipe,
  type PlannedMeal,
} from "../domain/nutrition-planning";
import type { Food } from "../domain/nutrition";
const food = (f: Food) => ({ ...f, per100g: { ...f.per100g } });
const recipe = (r: NutritionRecipe) => ({
  ...r,
  ingredients: r.ingredients.map((i) => ({ ...i, food: food(i.food) })),
});
const meal = (m: PlannedMeal): PlannedMeal => ({
  ...m,
  item:
    m.item.kind === "food"
      ? { kind: "food", food: food(m.item.food) }
      : { kind: "recipe", recipe: recipe(m.item.recipe) },
});
const queues = new WeakMap<Database, Map<string, Promise<unknown>>>();
export class NutritionPlanningRepository {
  constructor(private db: Database) {}
  private prefix(owner: string) {
    validatePlanningOwner(owner);
    return `nutrition-planning:${owner}:`;
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
      throw new AppFailure("auth", "Your account changed. Reopen Nutrition.");
  }
  async goals(owner: string) {
    const value = await this.db.get<NutritionGoals>(
      this.prefix(owner) + "goals",
    );
    if (value && value.ownerId !== owner)
      throw new AppFailure("validation", "Choose your own goals.");
    return value ? validateNutritionGoals(value) : null;
  }
  async recipes(owner: string) {
    return (await this.db.list<NutritionRecipe>(this.prefix(owner) + "recipe:"))
      .filter((r) => r.ownerId === owner)
      .map(validateNutritionRecipe)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async meals(owner: string) {
    return (await this.db.list<PlannedMeal>(this.prefix(owner) + "meal:"))
      .filter((m) => m.ownerId === owner)
      .map(validatePlannedMeal)
      .sort((a, b) => a.day.localeCompare(b.day) || b.updatedAt - a.updatedAt);
  }
  private write(
    owner: string,
    key: string,
    value: unknown,
    expected: unknown,
    limit?: { prefix: string; count: number },
  ) {
    return this.mutate(owner, async () => {
      if (JSON.stringify(await this.db.get(key)) !== JSON.stringify(expected))
        throw new AppFailure(
          "validation",
          "This nutrition plan changed. Reload before saving.",
        );
      if (
        expected === null &&
        limit &&
        (await this.db.list(limit.prefix)).length >= limit.count
      )
        throw new AppFailure(
          "validation",
          "Your nutrition planner is full. Delete an unused record before adding another.",
        );
      await this.auth(owner);
      await this.db.set(key, value);
    });
  }
  async saveGoals(goals: NutritionGoals, expected: NutritionGoals | null) {
    const next = validateNutritionGoals({
        ...goals,
        targets: { ...goals.targets },
      }),
      previous = expected
        ? { ...expected, targets: { ...expected.targets } }
        : null;
    return this.write(
      next.ownerId,
      this.prefix(next.ownerId) + "goals",
      next,
      previous,
    );
  }
  async saveRecipe(value: NutritionRecipe, expected: NutritionRecipe | null) {
    const next = validateNutritionRecipe(recipe(value));
    return this.write(
      next.ownerId,
      this.prefix(next.ownerId) + "recipe:" + next.id,
      next,
      expected ? recipe(expected) : null,
      { prefix: this.prefix(next.ownerId) + "recipe:", count: 100 },
    );
  }
  async saveMeal(value: PlannedMeal, expected: PlannedMeal | null) {
    const next = validatePlannedMeal(meal(value));
    return this.write(
      next.ownerId,
      this.prefix(next.ownerId) + "meal:" + next.id,
      next,
      expected ? meal(expected) : null,
      { prefix: this.prefix(next.ownerId) + "meal:", count: 1000 },
    );
  }
  private remove(owner: string, key: string, expected: unknown) {
    return this.mutate(owner, async () => {
      if (JSON.stringify(await this.db.get(key)) !== JSON.stringify(expected))
        throw new AppFailure(
          "validation",
          "This nutrition plan changed. Reload before deleting.",
        );
      await this.auth(owner);
      await this.db.remove(key);
    });
  }
  async removeRecipe(value: NutritionRecipe) {
    const snapshot = recipe(value);
    validateNutritionRecipe(snapshot);
    return this.remove(
      snapshot.ownerId,
      this.prefix(snapshot.ownerId) + "recipe:" + snapshot.id,
      snapshot,
    );
  }
  async removeMeal(value: PlannedMeal) {
    const snapshot = meal(value);
    validatePlannedMeal(snapshot);
    return this.remove(
      snapshot.ownerId,
      this.prefix(snapshot.ownerId) + "meal:" + snapshot.id,
      snapshot,
    );
  }
  purge(owner: string) {
    return this.mutate(owner, () => this.db.removePrefix(this.prefix(owner)));
  }
}

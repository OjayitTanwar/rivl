import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { NutritionPlanningRepository } from "../src/services/nutrition-planning-repository";
import {
  nutritionWeekDays,
  nutritionWeekReport,
  recipeNutrients,
  nutritionGroceryList,
  validateNutritionRecipe,
  validateNutritionGoals,
  plannedNutrients,
  type NutritionRecipe,
  type PlannedMeal,
} from "../src/domain/nutrition-planning";
import type { Food, NutritionEntry } from "../src/domain/nutrition";
const food: Food = {
  name: "Measured label",
  brand: "",
  source: "manual",
  per100g: { kcal: 100, protein: 10, carbs: null, fat: 0 },
};
const recipe = (): NutritionRecipe => ({
  id: "r",
  ownerId: "me",
  name: "My recipe",
  yieldGrams: 150,
  updatedAt: 1,
  ingredients: [
    { food, grams: 100 },
    {
      food: {
        ...food,
        name: "Other ingredient",
        per100g: { kcal: 200, protein: 0, carbs: 10, fat: 5 },
      },
      grams: 50,
    },
  ],
});
const planned = (id = "m"): PlannedMeal => ({
  id,
  ownerId: "me",
  day: "2026-10-14",
  meal: "lunch",
  grams: 75,
  item: { kind: "recipe", recipe: recipe() },
  updatedAt: 1,
});
async function setup() {
  const db = new MemoryDatabase();
  await db.set("session", { userId: "me" });
  return { db, repo: new NutritionPlanningRepository(db) };
}
describe("Nutrition planning", () => {
  it("uses measured batch weight and preserves unknown nutrients in recipe portions", () => {
    expect(recipeNutrients(recipe())).toEqual({
      kcal: 200,
      protein: 10,
      carbs: null,
      fat: 2.5,
    });
    expect(recipeNutrients(recipe(), 75)).toEqual({
      kcal: 100,
      protein: 5,
      carbs: null,
      fat: 1.25,
    });
    expect(plannedNutrients(planned())).toEqual(recipeNutrients(recipe(), 75));
  });
  it("rejects invalid yields amounts targets and unmeasured recipe ingredients", () => {
    for (const yieldGrams of [0, NaN, 100001])
      expect(() =>
        validateNutritionRecipe({ ...recipe(), yieldGrams }),
      ).toThrow();
    expect(() =>
      validateNutritionRecipe({ ...recipe(), ingredients: [] }),
    ).toThrow();
    for (const kcal of [-1, 0, NaN, 20001])
      expect(() =>
        validateNutritionGoals({
          ownerId: "me",
          updatedAt: 1,
          targets: { kcal, protein: null, carbs: null, fat: null },
        }),
      ).toThrow();
    expect(
      validateNutritionGoals({
        ownerId: "me",
        updatedAt: 1,
        targets: { kcal: null, protein: null, carbs: null, fat: null },
      }),
    ).toBeTruthy();
  });
  it("keeps unlogged report days distinct from missing nutrient fields and actual zero", () => {
    const entry: NutritionEntry = {
      id: "e",
      ownerId: "me",
      day: "2026-10-14",
      meal: "breakfast",
      grams: 100,
      food,
      updatedAt: 1,
    };
    const report = nutritionWeekReport([entry], "2026-10-14");
    expect(report).toHaveLength(7);
    expect(report[0]).toMatchObject({ entryCount: 0, totals: null });
    expect(report[6]).toMatchObject({
      entryCount: 1,
      totals: {
        fat: { known: 0, missing: 0 },
        carbs: { known: 0, missing: 1 },
      },
    });
  });
  it("derives calendar days across month leap-year and daylight-saving changes", () => {
    expect(nutritionWeekDays("2024-03-03")).toEqual([
      "2024-02-26",
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
      "2024-03-03",
    ]);
    expect(nutritionWeekDays("2026-11-03")).toHaveLength(7);
    expect(() => nutritionWeekDays("2026-02-30")).toThrow();
  });
  it("builds groceries from measured recipe portions plus direct food and excludes other dates", () => {
    const direct: PlannedMeal = {
      ...planned("direct"),
      grams: 25,
      item: { kind: "food", food },
    };
    const result = nutritionGroceryList(
      [planned(), direct, { ...planned("otherday"), day: "2026-10-01" }],
      nutritionWeekDays("2026-10-14"),
    );
    expect(result.find((r) => r.food.name === food.name)?.grams).toBe(75);
    expect(result.find((r) => r.food.name === "Other ingredient")?.grams).toBe(
      25,
    );
  });
  it("saves goals rejects stale edits and blocks account-cleanup writes", async () => {
    const { db, repo } = await setup(),
      original = {
        ownerId: "me",
        updatedAt: 1,
        targets: { kcal: 2200, protein: null, carbs: null, fat: null },
      };
    await repo.saveGoals(original, null);
    await repo.saveGoals({ ...original, updatedAt: 2 }, original);
    await expect(repo.saveGoals(original, original)).rejects.toThrow("changed");
    const current = await repo.goals("me");
    await db.set("account:cleanup", { userId: "me" });
    await expect(
      repo.saveGoals({ ...original, updatedAt: 3 }, current),
    ).rejects.toThrow("account changed");
    await repo.purge("me");
    expect(await repo.goals("me")).toBeNull();
  });
  it("snapshots recipe ingredients and planned recipes so later edits do not rewrite plans", async () => {
    const { repo } = await setup(),
      original = recipe();
    await repo.saveRecipe(original, null);
    await repo.saveMeal(planned(), null);
    const saved = await repo.recipes("me");
    await repo.saveRecipe(
      { ...saved[0]!, yieldGrams: 300, updatedAt: 2 },
      saved[0]!,
    );
    expect((await repo.meals("me"))[0]!.item).toMatchObject({
      kind: "recipe",
      recipe: { yieldGrams: 150 },
    });
    original.ingredients[0]!.grams = 900;
    expect((await repo.recipes("me"))[0]!.ingredients[0]!.grams).toBe(100);
  });
  it("serializes duplicate meal creates across repository instances and protects deletion", async () => {
    const { db, repo } = await setup(),
      other = new NutritionPlanningRepository(db);
    const result = await Promise.allSettled([
      repo.saveMeal(planned(), null),
      other.saveMeal(planned(), null),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const saved = (await repo.meals("me"))[0]!;
    await repo.saveMeal({ ...saved, grams: 50, updatedAt: 2 }, saved);
    await expect(repo.removeMeal(saved)).rejects.toThrow("changed");
    await repo.removeMeal((await repo.meals("me"))[0]!);
    expect(await repo.meals("me")).toEqual([]);
  });
  it("isolates exact owners rejects foreign recipe snapshots and purges one owner", async () => {
    const { db, repo } = await setup();
    await repo.saveRecipe(recipe(), null);
    await repo.saveMeal(planned(), null);
    await db.set("session", { userId: "other" });
    await expect(
      repo.saveMeal({ ...planned("other"), ownerId: "other" }, null),
    ).rejects.toThrow("your account");
    await repo.saveRecipe({ ...recipe(), ownerId: "other" }, null);
    await repo.purge("me");
    expect(await repo.recipes("me")).toEqual([]);
    expect(await repo.meals("me")).toEqual([]);
    expect(await repo.recipes("other")).toHaveLength(1);
  });
});

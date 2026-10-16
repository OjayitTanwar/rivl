import { AppFailure } from "../security/errors";
import {
  nutrientKeys,
  meals,
  validateFood,
  validNutritionDay,
  entryNutrients,
  nutritionTotals,
  type Food,
  type Nutrients,
  type Meal,
  type NutritionEntry,
} from "./nutrition";
export type NutritionGoals = {
  ownerId: string;
  updatedAt: number;
  targets: Nutrients;
};
export type RecipeIngredient = { food: Food; grams: number };
export type NutritionRecipe = {
  id: string;
  ownerId: string;
  name: string;
  ingredients: RecipeIngredient[];
  yieldGrams: number;
  sourceUrl?: string;
  updatedAt: number;
};
export type PlannedMeal = {
  id: string;
  ownerId: string;
  day: string;
  meal: Meal;
  grams: number;
  updatedAt: number;
  item:
    { kind: "food"; food: Food } | { kind: "recipe"; recipe: NutritionRecipe };
};
const fail = (message: string): never => {
  throw new AppFailure("validation", message);
};
export function validatePlanningOwner(owner: string) {
  if (typeof owner !== "string" || !owner || owner.includes(":"))
    fail("Sign in to keep your nutrition plans.");
  return owner;
}
const identity = (value: {
  id: string;
  ownerId: string;
  updatedAt: number;
}) => {
  validatePlanningOwner(value?.ownerId);
  if (
    typeof value.id !== "string" ||
    !value.id ||
    value.id.includes(":") ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0
  )
    fail("Choose a valid nutrition record.");
};
const grams = (value: number, limit = 10000) => {
  if (!Number.isFinite(value) || value <= 0 || value > limit)
    fail(`Enter a gram amount above zero and up to ${limit.toLocaleString()}.`);
};
export function validateNutritionGoals(goals: NutritionGoals) {
  validatePlanningOwner(goals?.ownerId);
  if (!Number.isFinite(goals.updatedAt) || goals.updatedAt <= 0)
    fail("Choose a valid goal date.");
  for (const key of nutrientKeys) {
    const value = goals.targets?.[key];
    if (
      value !== null &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > (key === "kcal" ? 20000 : 2000))
    )
      fail("Enter positive targets, or leave a target blank.");
  }
  return goals;
}
export function validateNutritionRecipe(recipe: NutritionRecipe) {
  identity(recipe);
  if (
    typeof recipe.name !== "string" ||
    !recipe.name.trim() ||
    recipe.name.length > 100
  )
    fail("Enter a recipe name up to 100 characters.");
  if (
    recipe.sourceUrl !== undefined &&
    (typeof recipe.sourceUrl !== "string" ||
      recipe.sourceUrl.length > 2000 ||
      !/^https:\/\//.test(recipe.sourceUrl))
  )
    fail("Choose a valid recipe source link.");
  grams(recipe.yieldGrams, 100000);
  if (
    !Array.isArray(recipe.ingredients) ||
    recipe.ingredients.length < 1 ||
    recipe.ingredients.length > 50
  )
    fail("Use between 1 and 50 measured ingredients.");
  for (const ingredient of recipe.ingredients) {
    validateFood(ingredient.food);
    grams(ingredient.grams, 100000);
  }
  return recipe;
}
export function recipeNutrients(
  recipe: NutritionRecipe,
  amountGrams = recipe.yieldGrams,
): Nutrients {
  validateNutritionRecipe(recipe);
  grams(amountGrams, 100000);
  return Object.fromEntries(
    nutrientKeys.map((key) => [
      key,
      recipe.ingredients.some((i) => i.food.per100g[key] === null)
        ? null
        : (recipe.ingredients.reduce(
            (sum, i) => sum + (i.food.per100g[key]! * i.grams) / 100,
            0,
          ) *
            amountGrams) /
          recipe.yieldGrams,
    ]),
  ) as Nutrients;
}
export function validatePlannedMeal(meal: PlannedMeal) {
  identity(meal);
  if (!validNutritionDay(meal.day) || !meals.includes(meal.meal))
    fail("Choose a valid meal date and type.");
  grams(meal.grams);
  if (meal.item?.kind === "food") validateFood(meal.item.food);
  else if (meal.item?.kind === "recipe") {
    validateNutritionRecipe(meal.item.recipe);
    if (meal.item.recipe.ownerId !== meal.ownerId)
      fail("Choose a recipe from your account.");
  } else fail("Choose a food or recipe.");
  return meal;
}
export function plannedNutrients(meal: PlannedMeal) {
  validatePlannedMeal(meal);
  return meal.item.kind === "recipe"
    ? recipeNutrients(meal.item.recipe, meal.grams)
    : (Object.fromEntries(
        nutrientKeys.map((key) => [
          key,
          meal.item.kind === "food" && meal.item.food.per100g[key] !== null
            ? (meal.item.food.per100g[key]! * meal.grams) / 100
            : null,
        ]),
      ) as Nutrients);
}
export function nutritionWeekDays(endDay: string) {
  if (!validNutritionDay(endDay)) fail("Choose a date in YYYY-MM-DD format.");
  const end = new Date(endDay + "T12:00:00Z").getTime();
  return Array.from({ length: 7 }, (_, i) =>
    new Date(end - (6 - i) * 86400000).toISOString().slice(0, 10),
  );
}
export function nutritionWeekReport(entries: NutritionEntry[], endDay: string) {
  return nutritionWeekDays(endDay).map((day) => {
    const logged = entries.filter((e) => e.day === day);
    return {
      day,
      entryCount: logged.length,
      totals: logged.length ? nutritionTotals(logged) : null,
    };
  });
}
export function nutritionFoodKey(food: Food) {
  return JSON.stringify([
    food.source,
    food.barcode ?? null,
    food.name,
    food.brand,
    food.per100g,
    food.micronutrients ?? null,
  ]);
}
export function nutritionGroceryList(planned: PlannedMeal[], days: string[]) {
  const totals = new Map<string, { food: Food; grams: number }>();
  for (const meal of planned.filter((p) => days.includes(p.day))) {
    validatePlannedMeal(meal);
    const recipe = meal.item.kind === "recipe" ? meal.item.recipe : null;
    const expanded = recipe
      ? recipe.ingredients.map((i) => ({
          food: i.food,
          grams: (i.grams * meal.grams) / recipe.yieldGrams,
        }))
      : [
          {
            food: (meal.item as { kind: "food"; food: Food }).food,
            grams: meal.grams,
          },
        ];
    for (const ingredient of expanded) {
      const key = nutritionFoodKey(ingredient.food),
        previous = totals.get(key);
      totals.set(key, {
        food: ingredient.food,
        grams: (previous?.grams ?? 0) + ingredient.grams,
      });
    }
  }
  return [...totals.values()].sort((a, b) =>
    a.food.name.localeCompare(b.food.name),
  );
}

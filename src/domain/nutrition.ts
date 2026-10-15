import { AppFailure } from "../security/errors";
export const meals = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof meals)[number];
export const nutrientKeys = ["kcal", "protein", "carbs", "fat"] as const;
export type Nutrients = Record<(typeof nutrientKeys)[number], number | null>;
export type Food = {
  name: string;
  brand: string;
  per100g: Nutrients;
  source: "manual" | "open-food-facts";
  barcode?: string;
  retrievedAt?: number;
};
export type NutritionEntry = {
  id: string;
  ownerId: string;
  day: string;
  meal: Meal;
  grams: number;
  food: Food;
  updatedAt: number;
};
const fail = (message: string): never => {
  throw new AppFailure("validation", message);
};
export function validNutritionDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day &&
    Number(day.slice(0, 4)) >= 1900
  );
}
export function localNutritionDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validateFood(food: Food): Food {
  if (
    !food ||
    typeof food.name !== "string" ||
    !food.name.trim() ||
    food.name.length > 180 ||
    typeof food.brand !== "string" ||
    food.brand.length > 180
  )
    fail("Enter a food name up to 180 characters.");
  if (!["manual", "open-food-facts"].includes(food.source))
    fail("Choose a valid food source.");
  for (const key of nutrientKeys) {
    const value = food.per100g?.[key];
    if (
      value !== null &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > (key === "kcal" ? 1000 : 100))
    )
      fail(
        "Enter valid nutrients per 100 g, or leave unavailable values blank.",
      );
  }
  if (
    food.source === "open-food-facts" &&
    (!/^\d{8,14}$/.test(food.barcode ?? "") ||
      !Number.isFinite(food.retrievedAt) ||
      food.retrievedAt! <= 0)
  )
    fail("Choose a valid database product.");
  return food;
}
export function validateNutritionEntry(entry: NutritionEntry): NutritionEntry {
  if (
    !entry ||
    typeof entry.ownerId !== "string" ||
    !entry.ownerId ||
    entry.ownerId.includes(":") ||
    typeof entry.id !== "string" ||
    !entry.id ||
    entry.id.includes(":")
  )
    fail("Sign in to save your meal diary.");
  if (!validNutritionDay(entry.day) || !meals.includes(entry.meal))
    fail("Choose a valid meal and date (YYYY-MM-DD).");
  if (!Number.isFinite(entry.grams) || entry.grams <= 0 || entry.grams > 10000)
    fail("Enter an amount between 0 and 10,000 grams.");
  if (!Number.isFinite(entry.updatedAt) || entry.updatedAt <= 0)
    fail("Choose a valid record time.");
  validateFood(entry.food);
  return entry;
}
export function entryNutrients(entry: NutritionEntry): Nutrients {
  return Object.fromEntries(
    nutrientKeys.map((key) => [
      key,
      entry.food.per100g[key] === null
        ? null
        : (entry.food.per100g[key]! * entry.grams) / 100,
    ]),
  ) as Nutrients;
}
export function nutritionTotals(entries: NutritionEntry[]) {
  return Object.fromEntries(
    nutrientKeys.map((key) => [
      key,
      {
        known: entries.reduce(
          (sum, entry) => sum + (entryNutrients(entry)[key] ?? 0),
          0,
        ),
        missing: entries.filter((entry) => entry.food.per100g[key] === null)
          .length,
      },
    ]),
  ) as Record<
    (typeof nutrientKeys)[number],
    { known: number; missing: number }
  >;
}
export function parseNutritionNumber(text: string): number | null {
  if (!text.trim()) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(text.trim()))
    fail("Use a positive number or leave an unavailable nutrient blank.");
  return Number(text.trim().replace(",", "."));
}

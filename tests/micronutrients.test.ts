import { describe, expect, it } from "vitest";
import { decodeFood } from "../src/services/food-lookup";
import { micronutrientTotals } from "../src/domain/micronutrients";
import { validateFood, type NutritionEntry } from "../src/domain/nutrition";
const product = (nutriments: Record<string, unknown>) =>
  decodeFood({ code: "12345678", product_name: "Test", nutriments }, 1)!;
describe("additional food nutrients", () => {
  it("converts provider grams to mg and micrograms without fabricating missing nutrients", () => {
    const food = product({
      sodium_100g: 0.4,
      "vitamin-d_100g": 0.000005,
      fiber_100g: 0,
    });
    expect(food.micronutrients?.sodium).toBe(400);
    expect(food.micronutrients?.vitaminD).toBe(5);
    expect(food.micronutrients?.fiber).toBe(0);
    expect(food.micronutrients?.iron).toBeNull();
  });
  it("rejects invalid extra values and preserves old foods", () => {
    const food = product({});
    delete food.micronutrients;
    expect(validateFood(food)).toBe(food);
    expect(() =>
      validateFood({ ...food, micronutrients: { sodium: NaN } }),
    ).toThrow();
  });
  it("scales grams and counts missing products rather than treating them as measured zero", () => {
    const entries = [
      { grams: 50, food: product({ iron_100g: 0.002 }) },
      { grams: 100, food: product({}) },
    ] as NutritionEntry[];
    expect(micronutrientTotals(entries).iron).toEqual({ known: 1, missing: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { NutritionRepository } from "../src/services/nutrition-repository";
import { decodeFood, FoodLookup } from "../src/services/food-lookup";
import {
  entryNutrients,
  nutritionTotals,
  validateNutritionEntry,
  validNutritionDay,
  type NutritionEntry,
} from "../src/domain/nutrition";
const entry = (id = "a"): NutritionEntry => ({
  id,
  ownerId: "me",
  day: "2026-10-14",
  meal: "breakfast",
  grams: 125,
  updatedAt: 1,
  food: {
    name: "Label food",
    brand: "",
    source: "manual",
    per100g: { kcal: 120, protein: 4, carbs: null, fat: 0 },
  },
});
describe("Nutrition diary", () => {
  it("scales gram portions while preserving unknown and measured zero nutrients", () => {
    expect(entryNutrients(entry())).toEqual({
      kcal: 150,
      protein: 5,
      carbs: null,
      fat: 0,
    });
    expect(nutritionTotals([entry()])).toMatchObject({
      carbs: { known: 0, missing: 1 },
      fat: { known: 0, missing: 0 },
    });
  });
  it("rejects impossible dates and invalid nutrient units", () => {
    expect(validNutritionDay("2026-02-30")).toBe(false);
    expect(validNutritionDay("2024-02-29")).toBe(true);
    for (const grams of [NaN, 0, -1, 10001])
      expect(() => validateNutritionEntry({ ...entry(), grams })).toThrow();
    expect(() =>
      validateNutritionEntry({
        ...entry(),
        food: {
          ...entry().food,
          per100g: { kcal: 120, carbs: 101, fat: 0, protein: 1 },
        },
      }),
    ).toThrow();
  });
  it("creates edits deletes and isolates owner data", async () => {
    const db = new MemoryDatabase(),
      repo = new NutritionRepository(db),
      original = entry();
    await db.set("session", { userId: "me" });
    await repo.save(original, null);
    await db.set("session", { userId: "other" });
    await repo.save({ ...entry("b"), ownerId: "other" }, null);
    await db.set("session", { userId: "me" });
    await repo.save({ ...original, grams: 200, updatedAt: 2 }, original);
    await expect(repo.remove(original)).rejects.toThrow("changed");
    await repo.remove((await repo.list("me"))[0]!);
    expect(await repo.list("me")).toEqual([]);
    expect(await repo.list("other")).toHaveLength(1);
    await repo.purge("other");
    expect(await repo.list("other")).toEqual([]);
  });
  it("serializes simultaneous duplicate creates across repository instances", async () => {
    const db = new MemoryDatabase(),
      a = new NutritionRepository(db),
      b = new NutritionRepository(db);
    await db.set("session", { userId: "me" });
    const result = await Promise.allSettled([
      a.save(entry(), null),
      b.save(entry(), null),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await a.list("me")).toHaveLength(1);
  });
  it("snapshots input before queued mutation", async () => {
    const db = new MemoryDatabase(),
      repo = new NutritionRepository(db),
      original = entry();
    await db.set("session", { userId: "me" });
    const saving = repo.save(original, null);
    original.food.per100g.kcal = 900;
    await saving;
    expect((await repo.list("me"))[0]!.food.per100g.kcal).toBe(120);
  });
  it("rejects a queued write when the signed in owner changes", async () => {
    const db = new MemoryDatabase(),
      repo = new NutritionRepository(db);
    await db.set("session", { userId: "other" });
    await expect(repo.save(entry(), null)).rejects.toThrow("account changed");
    expect(await repo.list("me")).toEqual([]);
  });
  it("decodes only explicit per100g values and omits malformed database products", () => {
    expect(
      decodeFood({
        code: "12345678",
        product_name: "Food",
        nutriments: {
          "energy-kcal_100g": NaN,
          proteins_100g: 0,
          carbohydrates_serving: 12,
        },
      })?.per100g,
    ).toEqual({ kcal: null, protein: 0, carbs: null, fat: null });
    expect(decodeFood({ code: "../bad", product_name: "Food" })).toBeNull();
  });
  it("uses bounded public requests without diary or account data and throttles explicit search", async () => {
    let called = "",
      count = 0;
    const transport = (async (input: RequestInfo | URL) => {
      called = String(input);
      count++;
      return new Response(
        JSON.stringify({
          products: [
            {
              code: "12345678",
              product_name: "Food",
              nutriments: { proteins_100g: 2 },
            },
          ],
        }),
      );
    }) as typeof fetch;
    const lookup = new FoodLookup(transport, () => 100000);
    expect(await lookup.find("oat & rice", "search")).toHaveLength(1);
    expect(called).toContain("oat%20%26%20rice");
    expect(called).not.toContain("owner");
    await expect(lookup.find("other food", "search")).rejects.toThrow("Wait");
    expect(count).toBe(1);
    await expect(lookup.find("<bad>", "barcode")).rejects.toThrow("barcode");
  });
  it("supports product misses and service errors without invented food", async () => {
    const missing = new FoodLookup(
      (async () => new Response(JSON.stringify({ status: 0 }))) as typeof fetch,
    );
    expect(await missing.find("12345678", "barcode")).toEqual([]);
    const busy = new FoodLookup(
      (async () => new Response("", { status: 429 })) as typeof fetch,
    );
    await expect(busy.find("12345678", "barcode")).rejects.toThrow("busy");
  });
});

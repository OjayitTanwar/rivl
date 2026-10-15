import { apiJson } from "../security/transport";
import { AppFailure } from "../security/errors";
import { validateFood, type Food } from "../domain/nutrition";
const base = "https://world.openfoodfacts.org";
const fields = "code,product_name,brands,nutriments,nutrition_data_per";
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function decodeFood(value: unknown, now = Date.now()): Food | null {
  const p = object(value),
    n = object(p.nutriments);
  // Do not reinterpret a millilitre-based label as grams without measured density.
  if (p.nutrition_data_per === "100ml") return null;
  if (
    typeof p.product_name !== "string" ||
    !p.product_name.trim() ||
    typeof p.code !== "string" ||
    !/^\d{8,14}$/.test(p.code)
  )
    return null;
  const nutrient = (key: string, limit: number) =>
    typeof n[key] === "number" &&
    Number.isFinite(n[key]) &&
    (n[key] as number) >= 0 &&
    (n[key] as number) <= limit
      ? (n[key] as number)
      : null;
  const food: Food = {
    name: p.product_name.slice(0, 180),
    brand: typeof p.brands === "string" ? p.brands.slice(0, 180) : "",
    barcode: p.code,
    source: "open-food-facts",
    retrievedAt: now,
    per100g: {
      kcal: nutrient("energy-kcal_100g", 1000),
      protein: nutrient("proteins_100g", 100),
      carbs: nutrient("carbohydrates_100g", 100),
      fat: nutrient("fat_100g", 100),
    },
  };
  return validateFood(food);
}
export class FoodLookup {
  private nextSearch = 0;
  private nextBarcode = 0;
  constructor(
    private transport: typeof fetch = fetch,
    private now = Date.now,
  ) {}
  async find(
    query: string,
    mode: "search" | "barcode",
    signal?: AbortSignal,
  ): Promise<Food[]> {
    const text = query.trim();
    if (
      mode === "barcode"
        ? !/^\d{8,14}$/.test(text)
        : text.length < 3 || text.length > 80
    )
      throw new AppFailure(
        "validation",
        mode === "barcode"
          ? "Enter the 8–14 digit barcode printed on the package."
          : "Enter a food name between 3 and 80 characters.",
      );
    const now = this.now();
    if (now < (mode === "search" ? this.nextSearch : this.nextBarcode))
      throw new AppFailure(
        "validation",
        "Wait a few seconds before another lookup.",
      );
    if (mode === "search") this.nextSearch = now + 6500;
    else this.nextBarcode = now + 4500;
    const url =
      mode === "barcode"
        ? `${base}/api/v3.6/product/${text}?fields=${fields}`
        : `${base}/cgi/search.pl?search_terms=${encodeURIComponent(text)}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}`;
    const contact = process.env.EXPO_PUBLIC_FOOD_LOOKUP_CONTACT?.trim();
    const result = object(
      await apiJson(
        base,
        url,
        {
          signal,
          headers: {
            "User-Agent": `RIVL/1.0${contact ? ` (${contact})` : ""}`,
          },
        },
        {
          transport: this.transport,
          timeoutMs: 12000,
          maxBytes: 500000,
          checkResponse: (response) => {
            if (!response.ok)
              throw new AppFailure(
                "server",
                response.status === 429
                  ? "Food lookup is busy. Try again later."
                  : "Food lookup is unavailable. You can still enter a food manually.",
                true,
              );
          },
        },
      ),
    );
    const products =
      mode === "barcode"
        ? [result.product]
        : Array.isArray(result.products)
          ? result.products.slice(0, 20)
          : [];
    const seen = new Set<string>();
    return products
      .map((p) => decodeFood(p, now))
      .filter(
        (p): p is Food =>
          !!p && !seen.has(p.barcode!) && !!seen.add(p.barcode!),
      );
  }
}

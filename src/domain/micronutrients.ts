import type { NutritionEntry } from "./nutrition";

/** All amounts are per 100 g, in the displayed unit. Missing is never zero. */
export const micronutrientDefinitions = {
  fiber: { label: "Fibre", unit: "g", provider: "fiber", scale: 1, max: 100 },
  sugar: { label: "Sugars", unit: "g", provider: "sugars", scale: 1, max: 100 },
  saturatedFat: {
    label: "Saturated fat",
    unit: "g",
    provider: "saturated-fat",
    scale: 1,
    max: 100,
  },
  sodium: {
    label: "Sodium",
    unit: "mg",
    provider: "sodium",
    scale: 1000,
    max: 100000,
  },
  potassium: {
    label: "Potassium",
    unit: "mg",
    provider: "potassium",
    scale: 1000,
    max: 100000,
  },
  calcium: {
    label: "Calcium",
    unit: "mg",
    provider: "calcium",
    scale: 1000,
    max: 100000,
  },
  iron: {
    label: "Iron",
    unit: "mg",
    provider: "iron",
    scale: 1000,
    max: 100000,
  },
  magnesium: {
    label: "Magnesium",
    unit: "mg",
    provider: "magnesium",
    scale: 1000,
    max: 100000,
  },
  vitaminC: {
    label: "Vitamin C",
    unit: "mg",
    provider: "vitamin-c",
    scale: 1000,
    max: 100000,
  },
  vitaminD: {
    label: "Vitamin D",
    unit: "µg",
    provider: "vitamin-d",
    scale: 1000000,
    max: 100000000,
  },
  vitaminB12: {
    label: "Vitamin B12",
    unit: "µg",
    provider: "vitamin-b12",
    scale: 1000000,
    max: 100000000,
  },
} as const;
export type MicronutrientKey = keyof typeof micronutrientDefinitions;
export const micronutrientKeys = Object.keys(
  micronutrientDefinitions,
) as MicronutrientKey[];
export type Micronutrients = Partial<Record<MicronutrientKey, number | null>>;
export function validMicronutrients(values: unknown): values is Micronutrients {
  if (!values || typeof values !== "object" || Array.isArray(values))
    return false;
  return Object.entries(values).every(([key, value]) => {
    if (!Object.hasOwn(micronutrientDefinitions, key)) return false;
    return (
      value === null ||
      (typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= micronutrientDefinitions[key as MicronutrientKey].max)
    );
  });
}
export function micronutrientTotals(entries: NutritionEntry[]) {
  return Object.fromEntries(
    micronutrientKeys.map((key) => [
      key,
      {
        known: entries.reduce(
          (sum, entry) =>
            sum + ((entry.food.micronutrients?.[key] ?? 0) * entry.grams) / 100,
          0,
        ),
        missing: entries.filter(
          (entry) => entry.food.micronutrients?.[key] == null,
        ).length,
      },
    ]),
  ) as Record<MicronutrientKey, { known: number; missing: number }>;
}

import {
  micronutrientDefinitions,
  micronutrientKeys,
  micronutrientTotals,
} from "../../src/domain/micronutrients";
import { importRecipeUrl } from "../../src/services/recipe-import";
import { WorkspaceExit } from "../../src/ui/WorkspaceExit";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Platform, Share } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useStore } from "../../src/state/store";
import { database } from "../../src/storage/database";
import { NutritionRepository } from "../../src/services/nutrition-repository";
import { NutritionPlanningRepository } from "../../src/services/nutrition-planning-repository";
import {
  meals,
  nutrientKeys,
  localNutritionDay,
  parseNutritionNumber,
  type NutritionEntry,
  type Nutrients,
  type Food,
  type Meal,
} from "../../src/domain/nutrition";
import {
  nutritionWeekDays,
  nutritionWeekReport,
  nutritionGroceryList,
  nutritionFoodKey,
  recipeNutrients,
  plannedNutrients,
  type NutritionGoals,
  type NutritionRecipe,
  type PlannedMeal,
  type RecipeIngredient,
} from "../../src/domain/nutrition-planning";
import {
  Screen,
  Stack,
  Row,
  Txt,
  Field,
  Choice,
  Button,
  ListRow,
  Notice,
  Segmented,
  Metric,
  Empty,
} from "../../src/ui/primitives";
import { SettingsSection } from "../../src/ui/SettingsSection";
import { useTheme } from "../../src/ui/theme";
import { AppFailure, userMessage } from "../../src/security/errors";
import { LabelValueRow } from "../../src/ui/LabelValueRow";
const repo = new NutritionPlanningRepository(database),
  diary = new NutritionRepository(database);
const labels = {
  kcal: "Energy (kcal)",
  protein: "Protein (g)",
  carbs: "Carbohydrate (g)",
  fat: "Fat (g)",
};
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
type Tab = "report" | "goals" | "plan" | "recipes";
type Snapshot = {
  owner: string;
  goals: NutritionGoals | null;
  recipes: NutritionRecipe[];
  planned: PlannedMeal[];
  entries: NutritionEntry[];
};
function MacroRows({ values }: { values: Nutrients }) {
  return (
    <Stack gap={8}>
      {nutrientKeys.map((k) => (
        <LabelValueRow
          key={k}
          label={labels[k]}
          value={values[k] === null ? "Not set" : number(values[k]!)}
          muted={values[k] === null}
        />
      ))}
    </Stack>
  );
}
export default function NutritionInsights({
  initialSection = "report",
}: {
  initialSection?: Tab;
}) {
  const { profile } = useStore(),
    { c } = useTheme(),
    owner = profile?.id,
    ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [pending, setPending] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [planEnd, setPlanEnd] = useState(() =>
    new Date(
      new Date(localNutritionDay() + "T12:00:00Z").getTime() + 6 * 86400000,
    )
      .toISOString()
      .slice(0, 10),
  );
  const [reportEnd, setReportEnd] = useState(localNutritionDay());
  const [tab, setTab] = useState<Tab>(initialSection),
    [goalsEdit, setGoalsEdit] = useState(false),
    [targets, setTargets] = useState<Record<string, string>>({});
  const [recipeEdit, setRecipeEdit] = useState<{
      original: NutritionRecipe | null;
      id: string;
    } | null>(null),
    [recipeName, setRecipeName] = useState(""),
    [yieldGrams, setYieldGrams] = useState(""),
    [ingredients, setIngredients] = useState<RecipeIngredient[]>([]),
    [ingredientKey, setIngredientKey] = useState(""),
    [ingredientGrams, setIngredientGrams] = useState("");
  const [mealEdit, setMealEdit] = useState<{
      original: PlannedMeal | null;
      id: string;
    } | null>(null),
    [mealDay, setMealDay] = useState(localNutritionDay()),
    [mealType, setMealType] = useState<Meal>("breakfast"),
    [mealGrams, setMealGrams] = useState(""),
    [itemKey, setItemKey] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [recipeSource, setRecipeSource] = useState<string | undefined>();
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const importRevision = useRef(0);
  const lock = useRef(false);
  const read = async (id: string) => {
    const [goals, recipes, planned, entries] = await Promise.all([
      repo.goals(id),
      repo.recipes(id),
      repo.meals(id),
      diary.list(id),
    ]);
    return { owner: id, goals, recipes, planned, entries };
  };
  const draftOwner = useRef(owner);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError("");
      if (draftOwner.current !== owner) {
        setLoaded(false);
        setRecipeEdit(null);
        importRevision.current += 1;
        setImporting(false);
        setUnmatched([]);
        setRecipeUrl("");
        setRecipeSource(undefined);
        setMealEdit(null);
        setGoalsEdit(false);
        draftOwner.current = owner;
      }
      if (!owner) {
        setData(null);
        setLoading(false);
        return;
      }
      void read(owner)
        .then((snapshot) => {
          if (active) {
            setData(snapshot);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(userMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [owner, revision]),
  );
  const weekEnd = tab === "plan" ? planEnd : reportEnd;
  const setWeekEnd = tab === "plan" ? setPlanEnd : setReportEnd;
  const snapshot = data?.owner === owner ? data : null,
    ready = loaded && !!snapshot;
  const days = useMemo(() => {
    try {
      return nutritionWeekDays(weekEnd);
    } catch {
      return [];
    }
  }, [weekEnd]);
  const report = useMemo(
    () =>
      snapshot && days.length
        ? nutritionWeekReport(snapshot.entries, weekEnd)
        : [],
    [snapshot, days, weekEnd],
  );
  const weekEntries = useMemo(
    () => snapshot?.entries.filter((entry) => days.includes(entry.day)) ?? [],
    [snapshot, days],
  );
  const weekMicronutrients = useMemo(
    () => micronutrientTotals(weekEntries),
    [weekEntries],
  );
  const planned = useMemo(
    () => snapshot?.planned.filter((p) => days.includes(p.day)) ?? [],
    [snapshot, days],
  );
  const grocery = useMemo(
    () => nutritionGroceryList(planned, days),
    [planned, days],
  );
  const foods = useMemo(() => {
    const unique = new Map<string, Food>();
    for (const entry of snapshot?.entries ?? []) {
      const key = nutritionFoodKey(entry.food);
      if (!unique.has(key)) unique.set(key, entry.food);
      if (unique.size >= 100) break;
    }
    return [...unique.values()];
  }, [snapshot?.entries]);
  const foodOptions = foods.map((food, index) => ({
    label: food.name,
    value: `food:${index}`,
  }));
  const mealOptions = [
    ...foodOptions,
    ...(snapshot?.recipes ?? []).map((r) => ({
      label: `Recipe · ${r.name}`,
      value: `recipe:${r.id}`,
    })),
    ...(mealEdit?.original
      ? [
          {
            label: `Saved · ${mealEdit.original.item.kind === "food" ? mealEdit.original.item.food.name : mealEdit.original.item.recipe.name}`,
            value: "saved",
          },
        ]
      : []),
  ];
  const perform = async (
    label: string,
    work: (id: string) => Promise<unknown>,
  ) => {
    if (!owner || !ready || lock.current) return;
    const id = owner;
    lock.current = true;
    setPending(label);
    setError("");
    try {
      await work(id);
      const next = await read(id);
      if (ownerRef.current === id) {
        setData(next);
        setGoalsEdit(false);
        setRecipeEdit(null);
        setMealEdit(null);
      }
    } catch (e) {
      if (ownerRef.current === id) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id) setPending("");
    }
  };
  const positive = (text: string) => parseNutritionNumber(text) ?? NaN;
  const confirm = (body: string, action: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(body)) action();
    } else
      Alert.alert("Delete record?", body, [
        { text: "Keep", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: action },
      ]);
  };
  const openRecipe = (recipe?: NutritionRecipe) => {
    if (!ready || lock.current) return;
    setRecipeEdit({ original: recipe ?? null, id: recipe?.id ?? randomUUID() });
    setRecipeName(recipe?.name ?? "");
    setRecipeSource(recipe?.sourceUrl);
    setUnmatched([]);
    setYieldGrams(recipe ? String(recipe.yieldGrams) : "");
    setIngredients(recipe?.ingredients ?? []);
    setIngredientKey(foodOptions[0]?.value ?? "");
    setIngredientGrams("");
    setError("");
  };
  const openMeal = (meal?: PlannedMeal) => {
    if (!ready || lock.current || !days.length) return;
    setMealEdit({ original: meal ?? null, id: meal?.id ?? randomUUID() });
    setMealDay(meal?.day ?? days[0]!);
    setMealType(meal?.meal ?? "breakfast");
    setMealGrams(meal ? String(meal.grams) : "");
    setItemKey(meal ? "saved" : (mealOptions[0]?.value ?? ""));
    setError("");
  };
  const saveMeal = () =>
    void perform("Saving planned meal", (id) => {
      if (!mealEdit)
        throw new AppFailure("validation", "Choose a planned meal.");
      let item: PlannedMeal["item"] | undefined;
      if (itemKey === "saved") item = mealEdit.original?.item;
      else if (itemKey.startsWith("food:")) {
        const f = foods[Number(itemKey.slice(5))];
        if (f) item = { kind: "food", food: f };
      } else {
        const r = snapshot?.recipes.find((r) => `recipe:${r.id}` === itemKey);
        if (r) item = { kind: "recipe", recipe: r };
      }
      if (!item)
        throw new AppFailure("validation", "Choose a saved food or recipe.");
      return repo.saveMeal(
        {
          id: mealEdit.id,
          ownerId: id,
          day: mealDay,
          meal: mealType,
          grams: positive(mealGrams),
          item,
          updatedAt: Date.now(),
        },
        mealEdit.original,
      );
    });
  const loadRecipe = async () => {
    if (!owner || !ready || lock.current) return;
    const id = owner,
      request = ++importRevision.current;
    lock.current = true;
    setImporting(true);
    setError("");
    try {
      const preview = await importRecipeUrl(recipeUrl);
      if (ownerRef.current !== id || request !== importRevision.current) return;
      setRecipeEdit({ original: null, id: randomUUID() });
      setRecipeName(preview.name);
      setRecipeSource(preview.sourceUrl);
      setUnmatched(preview.ingredients);
      setIngredients([]);
      setYieldGrams("");
      setIngredientKey(foodOptions[0]?.value ?? "");
      setIngredientGrams("");
    } catch (e) {
      if (ownerRef.current === id && request === importRevision.current)
        setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id && request === importRevision.current)
        setImporting(false);
    }
  };
  const editing = goalsEdit || !!recipeEdit || !!mealEdit;
  return (
    <Screen
      title={
        initialSection === "plan"
          ? "Meal plan"
          : initialSection === "recipes"
            ? "Recipes"
            : "Nutrition insights"
      }
      action={<WorkspaceExit />}
      contentStyle={{ gap: 24, paddingBottom: 120 }}
    >
      <Stack gap={24}>
        {!owner ? (
          <Notice text="Sign in to keep nutrition goals, recipes and plans." />
        ) : (
          <>
            {initialSection === "report" && (
              <Segmented
                value={tab}
                options={[
                  { label: "Report", value: "report" },
                  { label: "Goals", value: "goals" },
                ]}
                onChange={(value) => {
                  if (!pending && !editing) {
                    setTab(value);
                    setError("");
                  }
                }}
              />
            )}
            {!!error && (
              <Notice
                text={error}
                retry={
                  !pending && !editing
                    ? () => setRevision((n) => n + 1)
                    : undefined
                }
              />
            )}
            {loading && (
              <Txt size="caption" color={c.muted}>
                {data?.owner === owner ? "Refreshing…" : "Loading…"}
              </Txt>
            )}
            {!!pending && <Txt color={c.muted}>{pending}…</Txt>}
            {ready && (tab === "report" || tab === "plan") && (
              <SettingsSection
                title={
                  days.length
                    ? `${new Date(days[0] + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(weekEnd + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : "Choose a valid week"
                }
                collapsible
              >
                <Field
                  label="Seven-day period ending (YYYY-MM-DD)"
                  value={weekEnd}
                  onChangeText={setWeekEnd}
                  editable={!pending && !editing}
                  maxLength={10}
                  autoCapitalize="none"
                />
                {!days.length && (
                  <Notice text="Choose a valid ending date in YYYY-MM-DD format." />
                )}
              </SettingsSection>
            )}
            {ready && tab === "report" && (
              <>
                <Stack gap={16}>
                  <Txt size="heading" weight="700">
                    Your week in food
                  </Txt>
                  <Row style={{ gap: 16, flexWrap: "wrap" }}>
                    <Metric
                      small
                      label="Days logged"
                      value={`${report.filter((day) => day.entryCount > 0).length} / ${days.length}`}
                    />
                    <Metric
                      small
                      label="Foods logged"
                      value={String(
                        report.reduce(
                          (count, day) => count + day.entryCount,
                          0,
                        ),
                      )}
                    />
                  </Row>
                </Stack>
                <Txt size="caption" color={c.muted}>
                  Logged intake only · missing values stay unavailable.
                </Txt>
                {!report.some((day) => day.entryCount > 0) && (
                  <Empty
                    title="No foods logged this week"
                    body="Your diary entries will appear here."
                    action={
                      <Button
                        title="Open diary"
                        variant="secondary"
                        onPress={() => router.push("/nutrition")}
                      />
                    }
                  />
                )}
                {report
                  .filter((day) => day.entryCount > 0)
                  .map((day) => (
                    <SettingsSection
                      key={day.day}
                      title={new Date(day.day + "T12:00:00").toLocaleDateString(
                        undefined,
                        { weekday: "short", month: "short", day: "numeric" },
                      )}
                      collapsible
                      initiallyOpen={day.entryCount > 0}
                    >
                      {!day.totals ? (
                        <Txt color={c.muted}>No foods logged</Txt>
                      ) : (
                        <>
                          <Txt size="caption" color={c.muted}>
                            {day.entryCount} food entries
                          </Txt>
                          {nutrientKeys.map((key) => (
                            <LabelValueRow
                              key={key}
                              label={labels[key]}
                              value={`${number(day.totals![key].known)}${day.totals![key].missing ? " + unavailable" : ""}${snapshot.goals?.targets[key] != null ? ` / ${number(snapshot.goals.targets[key]!)} target` : ""}`}
                            />
                          ))}
                        </>
                      )}
                    </SettingsSection>
                  ))}
                {!!weekEntries.length && (
                  <SettingsSection title="More nutrients this week" collapsible>
                    {micronutrientKeys.map((key) => {
                      const value = weekMicronutrients[key],
                        definition = micronutrientDefinitions[key];
                      return (
                        <LabelValueRow
                          key={key}
                          label={definition.label}
                          value={
                            value.missing === weekEntries.length
                              ? "Unavailable"
                              : `${number(value.known)} ${definition.unit}${value.missing ? " + unknown" : ""}`
                          }
                        />
                      );
                    })}
                    <Txt size="caption" color={c.muted}>
                      Recorded foods only. Missing values are not zero.
                    </Txt>
                  </SettingsSection>
                )}
                <Button
                  title="Export this week"
                  variant="secondary"
                  disabled={!!pending || !days.length}
                  onPress={() =>
                    void perform("Exporting week", async (id) => {
                      if (ownerRef.current !== id) return;
                      await Share.share({
                        title: "RIVL nutrition week",
                        message: JSON.stringify(
                          {
                            version: 1,
                            exportedAt: new Date().toISOString(),
                            timezone:
                              Intl.DateTimeFormat().resolvedOptions().timeZone,
                            days,
                            report,
                            additionalNutrients: weekMicronutrients,
                            goals: snapshot.goals,
                            actualEntries: snapshot.entries.filter((e) =>
                              days.includes(e.day),
                            ),
                            plannedMeals: planned,
                            groceryList: grocery,
                            foodDataLicense:
                              "Open Food Facts source records: ODbL / Database Contents License; https://world.openfoodfacts.org/data",
                          },
                          null,
                          2,
                        ),
                      });
                    })
                  }
                />
              </>
            )}
            {ready && tab === "goals" && (
              <SettingsSection title="Your daily targets">
                <Txt color={c.muted}>
                  Your own daily targets · leave unset values blank.
                </Txt>
                {goalsEdit ? (
                  <>
                    {nutrientKeys.map((key) => (
                      <Field
                        key={key}
                        label={labels[key]}
                        value={targets[key] ?? ""}
                        onChangeText={(text) =>
                          setTargets((prev) => ({ ...prev, [key]: text }))
                        }
                        editable={!pending}
                        keyboardType="decimal-pad"
                      />
                    ))}
                    <Button
                      title="Save targets"
                      disabled={!!pending}
                      onPress={() =>
                        void perform("Saving targets", (id) =>
                          repo.saveGoals(
                            {
                              ownerId: id,
                              updatedAt: Date.now(),
                              targets: Object.fromEntries(
                                nutrientKeys.map((k) => [
                                  k,
                                  parseNutritionNumber(targets[k] ?? ""),
                                ]),
                              ) as Nutrients,
                            },
                            snapshot.goals,
                          ),
                        )
                      }
                    />
                    <Button
                      title="Cancel"
                      variant="quiet"
                      disabled={!!pending}
                      onPress={() => {
                        setGoalsEdit(false);
                        setError("");
                      }}
                    />
                  </>
                ) : (
                  <>
                    <MacroRows
                      values={
                        snapshot.goals?.targets ?? {
                          kcal: null,
                          protein: null,
                          carbs: null,
                          fat: null,
                        }
                      }
                    />
                    <Button
                      title="Edit targets"
                      variant="secondary"
                      disabled={!!pending}
                      onPress={() => {
                        setTargets(
                          Object.fromEntries(
                            nutrientKeys.map((k) => [
                              k,
                              snapshot.goals?.targets[k] === null ||
                              snapshot.goals?.targets[k] === undefined
                                ? ""
                                : String(snapshot.goals.targets[k]),
                            ]),
                          ),
                        );
                        setGoalsEdit(true);
                      }}
                    />
                  </>
                )}
              </SettingsSection>
            )}
            {ready &&
              tab === "recipes" &&
              (recipeEdit ? (
                <SettingsSection
                  title={recipeEdit.original ? "Edit recipe" : "New recipe"}
                >
                  <Field
                    label="Recipe name"
                    value={recipeName}
                    onChangeText={setRecipeName}
                    editable={!pending}
                    maxLength={100}
                  />
                  <Field
                    label="Measured prepared weight (g)"
                    value={yieldGrams}
                    onChangeText={setYieldGrams}
                    keyboardType="decimal-pad"
                    editable={!pending}
                  />
                  <Txt color={c.muted}>
                    Use weighed ingredients and the finished batch weight.
                  </Txt>
                  {!!recipeSource && (
                    <Txt size="caption" color={c.muted}>
                      Source: {recipeSource}
                    </Txt>
                  )}
                  {!!unmatched.length && (
                    <Notice
                      text={`Confirm ${unmatched.length} remaining ingredients. Match the next ingredient to one of your logged foods and enter its measured grams. Website quantities and nutrition are never assumed.`}
                    />
                  )}
                  {!!unmatched.length && (
                    <Txt weight="600">Next: {unmatched[0]}</Txt>
                  )}
                  {ingredients.map((ingredient, index) => (
                    <ListRow
                      key={index}
                      title={`${ingredient.food.name} · ${number(ingredient.grams)} g`}
                      detail={
                        recipeSource && !recipeEdit.original
                          ? "Confirmed measured ingredient"
                          : "Tap to remove ingredient"
                      }
                      onPress={() => {
                        if (!pending && !(recipeSource && !recipeEdit.original))
                          setIngredients((prev) =>
                            prev.filter((_, i) => i !== index),
                          );
                      }}
                    />
                  ))}
                  {foodOptions.length ? (
                    <>
                      <Choice
                        label="Ingredient"
                        value={ingredientKey}
                        options={foodOptions}
                        onChange={(value) => {
                          if (!pending) setIngredientKey(value);
                        }}
                      />
                      <Field
                        label="Ingredient weight (g)"
                        value={ingredientGrams}
                        onChangeText={setIngredientGrams}
                        keyboardType="decimal-pad"
                        editable={!pending}
                      />
                      <Button
                        title="Add ingredient"
                        variant="secondary"
                        disabled={!!pending || ingredients.length >= 50}
                        onPress={() => {
                          try {
                            const food = foods[Number(ingredientKey.slice(5))],
                              amount = positive(ingredientGrams);
                            if (
                              !food ||
                              !Number.isFinite(amount) ||
                              amount <= 0 ||
                              amount > 100000
                            )
                              throw new AppFailure(
                                "validation",
                                "Choose a food and a measured ingredient amount.",
                              );
                            setIngredients((prev) => [
                              ...prev,
                              { food, grams: amount },
                            ]);
                            setIngredientGrams("");
                            setUnmatched((prev) => prev.slice(1));
                            setError("");
                          } catch (e) {
                            setError(userMessage(e));
                          }
                        }}
                      />
                    </>
                  ) : (
                    <Txt color={c.muted}>
                      Log a food in Nutrition before building a recipe.
                    </Txt>
                  )}
                  <Button
                    title="Save recipe"
                    disabled={!!pending || unmatched.length > 0}
                    onPress={() =>
                      void perform("Saving recipe", (id) => {
                        if (unmatched.length)
                          throw new AppFailure(
                            "validation",
                            "Confirm every imported ingredient before saving.",
                          );
                        if (!recipeEdit)
                          throw new AppFailure(
                            "validation",
                            "Choose a recipe.",
                          );
                        return repo.saveRecipe(
                          {
                            id: recipeEdit.id,
                            ownerId: id,
                            name: recipeName.trim(),
                            ...(recipeSource
                              ? { sourceUrl: recipeSource }
                              : {}),
                            ingredients,
                            yieldGrams: positive(yieldGrams),
                            updatedAt: Date.now(),
                          },
                          recipeEdit.original,
                        );
                      })
                    }
                  />
                  <Button
                    title="Cancel"
                    variant="quiet"
                    disabled={!!pending}
                    onPress={() => {
                      setRecipeEdit(null);
                      setError("");
                    }}
                  />
                  {!!recipeEdit.original && (
                    <Button
                      title="Delete recipe"
                      variant="danger"
                      disabled={!!pending}
                      onPress={() => {
                        const original = recipeEdit.original!;
                        confirm(
                          "Delete this reusable recipe? Existing meal plans retain their own snapshot.",
                          () =>
                            void perform("Deleting recipe", () =>
                              repo.removeRecipe(original),
                            ),
                        );
                      }}
                    />
                  )}
                </SettingsSection>
              ) : (
                <SettingsSection title="Reusable recipes">
                  <Txt color={c.muted}>
                    Your measured recipes, ready to reuse.
                  </Txt>
                  <Button
                    title="Create recipe"
                    onPress={() => openRecipe()}
                    disabled={!!pending || importing}
                  />
                  <SettingsSection title="Import from a website" collapsible>
                    <Field
                      label="Recipe website link"
                      value={recipeUrl}
                      onChangeText={setRecipeUrl}
                      autoCapitalize="none"
                      keyboardType="url"
                      editable={!pending && !importing}
                      maxLength={2000}
                      placeholder="https://…"
                    />
                    <Txt size="caption" color={c.muted}>
                      Review ingredients and measured grams before saving.
                    </Txt>
                    <Button
                      title={
                        importing ? "Opening recipe…" : "Import recipe link"
                      }
                      variant="secondary"
                      disabled={!!pending || importing || !recipeUrl.trim()}
                      onPress={() => void loadRecipe()}
                    />
                  </SettingsSection>
                  {!snapshot.recipes.length && (
                    <Empty
                      title="Keep your go-to meals"
                      body="Save measured ingredients as a reusable recipe."
                      action={
                        <Button
                          title="Open food diary"
                          variant="secondary"
                          onPress={() => router.push("/nutrition")}
                        />
                      }
                    />
                  )}
                  {snapshot.recipes.slice(0, visibleLimit).map((recipe) => (
                    <ListRow
                      key={recipe.id}
                      title={recipe.name}
                      detail={`${recipe.ingredients.length} ingredients · ${number(recipe.yieldGrams)} g prepared · ${recipeNutrients(recipe).kcal === null ? "Energy unavailable" : `${number(recipeNutrients(recipe).kcal!)} kcal per batch`}`}
                      onPress={() => openRecipe(recipe)}
                    />
                  ))}
                  {snapshot.recipes.length > visibleLimit && (
                    <Button
                      title="Show more recipes"
                      variant="quiet"
                      onPress={() => setVisibleLimit((n) => n + 50)}
                    />
                  )}
                </SettingsSection>
              ))}
            {ready &&
              tab === "plan" &&
              (mealEdit ? (
                <SettingsSection
                  title={
                    mealEdit.original ? "Edit planned meal" : "Plan a meal"
                  }
                >
                  <Choice
                    label="Date"
                    value={mealDay}
                    options={days.map((day) => ({ value: day, label: day }))}
                    onChange={(value) => {
                      if (!pending) setMealDay(value);
                    }}
                  />
                  <Choice
                    label="Meal"
                    value={mealType}
                    options={meals.map((value) => ({
                      value,
                      label: upper(value),
                    }))}
                    onChange={(value) => {
                      if (!pending) setMealType(value);
                    }}
                  />
                  <Choice
                    label="Food or recipe"
                    value={itemKey}
                    options={mealOptions}
                    onChange={(value) => {
                      if (!pending) setItemKey(value);
                    }}
                  />
                  <Field
                    label="Planned amount (g)"
                    value={mealGrams}
                    onChangeText={setMealGrams}
                    keyboardType="decimal-pad"
                    editable={!pending}
                  />
                  <Txt size="caption" color={c.muted}>
                    A plan is not a diary entry. Record what you eat separately.
                  </Txt>
                  <Button
                    title="Save planned meal"
                    disabled={!!pending}
                    onPress={saveMeal}
                  />
                  <Button
                    title="Cancel"
                    variant="quiet"
                    disabled={!!pending}
                    onPress={() => {
                      setMealEdit(null);
                      setError("");
                    }}
                  />
                  {!!mealEdit.original && (
                    <Button
                      title="Delete planned meal"
                      variant="danger"
                      disabled={!!pending}
                      onPress={() => {
                        const original = mealEdit.original!;
                        confirm(
                          "Remove this planned meal? Your food diary remains unchanged.",
                          () =>
                            void perform("Deleting planned meal", () =>
                              repo.removeMeal(original),
                            ),
                        );
                      }}
                    />
                  )}
                </SettingsSection>
              ) : (
                <>
                  <SettingsSection title="Seven-day meal plan">
                    <Row style={{ gap: 16, flexWrap: "wrap" }}>
                      <Metric
                        small
                        label="Meals planned"
                        value={String(planned.length)}
                      />
                      <Metric
                        small
                        label="Days planned"
                        value={`${new Set(planned.map((meal) => meal.day)).size} / ${days.length}`}
                      />
                    </Row>
                    <Txt size="caption" color={c.muted}>
                      Planned meals stay separate from your diary.
                    </Txt>
                    <Button
                      title="Plan a meal"
                      disabled={
                        !!pending || !days.length || !mealOptions.length
                      }
                      onPress={() => openMeal()}
                    />
                    {!mealOptions.length && (
                      <Empty
                        title="Give your week a starting point"
                        body="Log a food or save a recipe to begin."
                        action={
                          <Button
                            title="Open food diary"
                            variant="secondary"
                            onPress={() => router.push("/nutrition")}
                          />
                        }
                      />
                    )}
                    {!!mealOptions.length && !planned.length && (
                      <Txt color={c.muted}>No meals planned this week.</Txt>
                    )}
                    {days
                      .filter((day) => planned.some((meal) => meal.day === day))
                      .map((day) => (
                        <Stack key={day} gap={8}>
                          <Txt weight="600">
                            {new Date(day + "T12:00:00").toLocaleDateString(
                              undefined,
                              {
                                weekday: "long",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </Txt>
                          {planned
                            .filter((p) => p.day === day)
                            .slice(0, visibleLimit)
                            .map((meal) => (
                              <ListRow
                                key={meal.id}
                                title={`${upper(meal.meal)} · ${meal.item.kind === "food" ? meal.item.food.name : meal.item.recipe.name}`}
                                detail={`${number(meal.grams)} g · ${plannedNutrients(meal).kcal === null ? "Energy unavailable" : `${number(plannedNutrients(meal).kcal!)} kcal planned`}`}
                                onPress={() => openMeal(meal)}
                              />
                            ))}
                          {planned.filter((p) => p.day === day).length >
                            visibleLimit && (
                            <Button
                              title="Show more planned meals"
                              variant="quiet"
                              onPress={() => setVisibleLimit((n) => n + 50)}
                            />
                          )}
                          {!planned.some((p) => p.day === day) && (
                            <Txt size="caption" color={c.muted}>
                              Nothing planned yet
                            </Txt>
                          )}
                        </Stack>
                      ))}
                  </SettingsSection>
                  <SettingsSection
                    title={`Grocery list · ${grocery.length} items`}
                    collapsible
                    initiallyOpen={grocery.length > 0}
                  >
                    <Txt size="caption" color={c.muted}>
                      Measured ingredients from your plan; check your cupboard.
                    </Txt>
                    {grocery.slice(0, visibleLimit).map((item) => (
                      <LabelValueRow
                        key={nutritionFoodKey(item.food)}
                        label={`${item.food.name}${item.food.brand ? ` · ${item.food.brand}` : ""}`}
                        value={`${number(item.grams)} g`}
                      />
                    ))}
                    {grocery.length > visibleLimit && (
                      <Button
                        title="Show more groceries"
                        variant="quiet"
                        onPress={() => setVisibleLimit((n) => n + 50)}
                      />
                    )}
                    {!grocery.length && (
                      <Txt color={c.muted}>Plan a meal to build your list.</Txt>
                    )}
                  </SettingsSection>
                </>
              ))}
          </>
        )}
      </Stack>
    </Screen>
  );
}

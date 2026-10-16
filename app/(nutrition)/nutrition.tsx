import { NutritionIntakeAssist } from "../../src/ui/NutritionIntakeAssist";
import { NutritionBarcodeScanner } from "../../src/ui/NutritionBarcodeScanner";
import {
  micronutrientDefinitions,
  micronutrientKeys,
  micronutrientTotals,
} from "../../src/domain/micronutrients";
import { WorkspaceExit } from "../../src/ui/WorkspaceExit";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useStore } from "../../src/state/store";
import { database } from "../../src/storage/database";
import { NutritionRepository } from "../../src/services/nutrition-repository";
import { FoodLookup } from "../../src/services/food-lookup";
import {
  meals,
  nutrientKeys,
  localNutritionDay,
  validNutritionDay,
  nutritionTotals,
  entryNutrients,
  parseNutritionNumber,
  type Food,
  type Meal,
  type NutritionEntry,
} from "../../src/domain/nutrition";
import {
  Screen,
  Stack,
  Txt,
  Field,
  Choice,
  Button,
  ListRow,
  Notice,
  Row,
  Metric,
  Empty,
} from "../../src/ui/primitives";
import { SettingsSection } from "../../src/ui/SettingsSection";
import { useTheme } from "../../src/ui/theme";
import { AppFailure, userMessage } from "../../src/security/errors";
import { LabelValueRow } from "../../src/ui/LabelValueRow";
const repo = new NutritionRepository(database),
  lookup = new FoodLookup();
const titles = {
  kcal: "Energy (kcal)",
  protein: "Protein (g)",
  carbs: "Carbohydrate (g)",
  fat: "Fat (g)",
};
const title = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const display = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
export default function Nutrition() {
  const { profile } = useStore(),
    { c } = useTheme(),
    owner = profile?.id;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [revision, setRevision] = useState(0),
    [visibleLimit, setVisibleLimit] = useState(50);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<{
    owner: string;
    entries: NutritionEntry[];
  } | null>(null);
  const [day, setDay] = useState(localNutritionDay()),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [pending, setPending] = useState("");
  const [editor, setEditor] = useState<{
    original: NutritionEntry | null;
    id: string;
    food: Food | null;
  } | null>(null);
  const [meal, setMeal] = useState<Meal>("breakfast"),
    [name, setName] = useState(""),
    [grams, setGrams] = useState("");
  const [values, setValues] = useState<Record<string, string>>({
    kcal: "",
    protein: "",
    carbs: "",
    fat: "",
  });
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<"search" | "barcode">("search"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<Food[]>([]),
    [searched, setSearched] = useState(false);
  const lock = useRef(false),
    request = useRef<AbortController | null>(null),
    generation = useRef(0);
  const draftOwner = useRef(owner);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const token = ++generation.current;
      setLoading(true);
      if (draftOwner.current !== owner) {
        setLoaded(false);
        setEditor(null);
        draftOwner.current = owner;
      }
      setError("");
      setResults([]);
      setSearched(false);
      if (!owner) {
        setData(null);
        setLoading(false);
        return;
      }
      void repo
        .list(owner)
        .then((entries) => {
          if (active && token === generation.current) {
            setData({ owner, entries });
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
        setScanning(false);
        active = false;
        generation.current++;
        request.current?.abort();
      };
    }, [owner, revision]),
  );
  const ready = loaded && !!data && data.owner === owner;
  const entries = useMemo(
    () =>
      data && data.owner === owner
        ? data.entries.filter((e) => e.day === day)
        : [],
    [data, owner, day],
  );
  const totals = useMemo(() => nutritionTotals(entries), [entries]);
  const additional = useMemo(() => micronutrientTotals(entries), [entries]);
  const open = (entry?: NutritionEntry) => {
    if (!ready || lock.current) return;
    setScanning(false);
    setEditor({
      original: entry ?? null,
      id: entry?.id ?? randomUUID(),
      food: entry?.food ?? null,
    });
    setMeal(entry?.meal ?? "breakfast");
    setName(entry?.food.name ?? "");
    setGrams(entry ? String(entry.grams) : "");
    setValues(
      Object.fromEntries(
        nutrientKeys.map((k) => [
          k,
          entry?.food.per100g[k] === null ||
          entry?.food.per100g[k] === undefined
            ? ""
            : String(entry.food.per100g[k]),
        ]),
      ),
    );
    setResults([]);
    setSearched(false);
    setQuery("");
    setError("");
  };
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
      const records = await repo.list(id);
      if (ownerRef.current === id) {
        setData({ owner: id, entries: records });
        setEditor(null);
      }
    } catch (e) {
      if (ownerRef.current === id) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id) setPending("");
    }
  };
  const save = () =>
    void perform("Saving meal", async (id) => {
      if (!editor || !validNutritionDay(day))
        throw new AppFailure(
          "validation",
          "Choose a date in YYYY-MM-DD format.",
        );
      const food: Food =
        editor.food?.source === "open-food-facts"
          ? editor.food
          : {
              name: name.trim(),
              brand: "",
              source: "manual",
              per100g: Object.fromEntries(
                nutrientKeys.map((k) => [
                  k,
                  parseNutritionNumber(values[k] ?? ""),
                ]),
              ) as Food["per100g"],
            };
      await repo.save(
        {
          id: editor.id,
          ownerId: id,
          day,
          meal,
          grams: parseNutritionNumber(grams) ?? NaN,
          food,
          updatedAt: Date.now(),
        },
        editor.original,
      );
    });
  const find = async () => {
    if (!ready || lock.current || !editor) return;
    const id = owner,
      token = ++generation.current,
      controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    lock.current = true;
    setPending("Looking up food");
    setError("");
    setResults([]);
    setSearched(false);
    try {
      const foods = await lookup.find(query, mode, controller.signal);
      if (ownerRef.current === id && generation.current === token) {
        setResults(foods);
        setSearched(true);
      }
    } catch (e) {
      if (ownerRef.current === id && generation.current === token)
        setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id) setPending("");
    }
  };
  const remove = () => {
    const entry = editor?.original;
    if (!entry || lock.current) return;
    const action = () =>
      void perform("Deleting meal", () => repo.remove(entry));
    if (Platform.OS === "web") {
      if (window.confirm("Delete this meal entry?")) action();
    } else
      Alert.alert("Delete meal?", "This removes this entry from your diary.", [
        { text: "Keep entry", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: action },
      ]);
  };
  return (
    <Screen
      title="Food diary"
      action={<WorkspaceExit />}
      contentStyle={{ gap: 24, paddingBottom: 120 }}
    >
      <Stack gap={24}>
        {!owner ? (
          <Notice text="Sign in to keep your meal diary." />
        ) : (
          <>
            <SettingsSection
              title={
                validNutritionDay(day)
                  ? new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : "Choose a diary date"
              }
              collapsible
            >
              <Field
                label="Diary date (YYYY-MM-DD)"
                value={day}
                onChangeText={(text) => {
                  if (!editor && !pending) {
                    setDay(text);
                    setVisibleLimit(50);
                  }
                }}
                editable={!editor && !pending}
                maxLength={10}
                autoCapitalize="none"
              />
            </SettingsSection>
            {!!error && (
              <Notice
                text={error}
                retry={
                  !ready && !pending
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
            {!!pending && (
              <View accessibilityLiveRegion="polite">
                <Txt color={c.muted}>{pending}…</Txt>
              </View>
            )}
            {ready && !validNutritionDay(day) && (
              <Notice text="Choose a valid date in YYYY-MM-DD format." />
            )}
            {ready &&
              (editor ? (
                <>
                  <SettingsSection
                    title="Find packaged food"
                    collapsible
                    initiallyOpen={!editor.original}
                    key={editor.id}
                  >
                    {scanning ? (
                      <NutritionBarcodeScanner
                        onClose={() => setScanning(false)}
                        onScan={(code) => {
                          setQuery(code);
                          setMode("barcode");
                          setScanning(false);
                          setResults([]);
                          setSearched(false);
                        }}
                      />
                    ) : (
                      <Button
                        title="Scan barcode"
                        variant="secondary"
                        disabled={!!pending}
                        onPress={() => setScanning(true)}
                      />
                    )}
                    {!scanning && (
                      <SettingsSection title="Photo or voice" collapsible>
                        <NutritionIntakeAssist
                          key={`${owner}:${editor.id}`}
                          disabled={!!pending}
                          onDraft={(draft) => {
                            if (pending) return;
                            setMode("search");
                            setEditor({ ...editor, food: null });
                            setName(draft.query);
                            setValues(
                              Object.fromEntries(
                                nutrientKeys.map((key) => [key, ""]),
                              ),
                            );
                            setError("");
                            setQuery(draft.query);
                            setResults([]);
                            setSearched(false);
                            setGrams(
                              draft.grams === null ? "" : String(draft.grams),
                            );
                          }}
                        />
                      </SettingsSection>
                    )}
                    <Choice
                      label="Lookup"
                      value={mode}
                      options={[
                        { label: "Food name", value: "search" },
                        { label: "Printed barcode", value: "barcode" },
                      ]}
                      onChange={(v) => {
                        if (!pending) {
                          setMode(v);
                          setResults([]);
                          setSearched(false);
                        }
                      }}
                    />
                    <Field
                      label={
                        mode === "barcode"
                          ? "Barcode digits"
                          : "Food name to search"
                      }
                      value={query}
                      onChangeText={setQuery}
                      maxLength={80}
                      editable={!pending}
                      keyboardType={
                        mode === "barcode" ? "number-pad" : "default"
                      }
                      onSubmitEditing={() => void find()}
                    />
                    <Button
                      title={
                        mode === "barcode" ? "Look up barcode" : "Search foods"
                      }
                      variant="secondary"
                      disabled={!!pending}
                      onPress={() => void find()}
                    />
                    {searched && !results.length && (
                      <Txt color={c.muted}>
                        No match. Enter the package values below.
                      </Txt>
                    )}
                    {results.map((food) => (
                      <ListRow
                        key={food.barcode}
                        title={food.name}
                        detail={food.brand || "Brand unavailable"}
                        onPress={() => {
                          if (!pending) {
                            setEditor({ ...editor, food });
                            setName(food.name);
                            setValues(
                              Object.fromEntries(
                                nutrientKeys.map((k) => [
                                  k,
                                  food.per100g[k] === null
                                    ? ""
                                    : String(food.per100g[k]),
                                ]),
                              ),
                            );
                            setResults([]);
                            setSearched(false);
                          }
                        }}
                      />
                    ))}
                  </SettingsSection>
                  <SettingsSection
                    title={editor.original ? "Edit food" : "Add food"}
                  >
                    <Choice
                      label="Meal"
                      value={meal}
                      options={meals.map((value) => ({
                        value,
                        label: title(value),
                      }))}
                      onChange={(value) => {
                        if (!pending) setMeal(value);
                      }}
                    />
                    <Field
                      label="Food name"
                      testID="nutrition-food-name"
                      value={name}
                      onChangeText={setName}
                      editable={
                        !pending && editor.food?.source !== "open-food-facts"
                      }
                      maxLength={180}
                    />
                    <Field
                      label="Amount eaten (g)"
                      value={grams}
                      onChangeText={setGrams}
                      editable={!pending}
                      keyboardType="decimal-pad"
                    />
                    <Txt color={c.muted}>
                      Per 100 g · leave unknown values blank.
                    </Txt>
                    {nutrientKeys.map((key) => (
                      <Field
                        key={key}
                        label={titles[key]}
                        value={values[key]}
                        onChangeText={(value) =>
                          setValues((previous) => ({
                            ...previous,
                            [key]: value,
                          }))
                        }
                        editable={
                          !pending && editor.food?.source !== "open-food-facts"
                        }
                        keyboardType="decimal-pad"
                      />
                    ))}
                    {editor.food?.source === "open-food-facts" && (
                      <>
                        <Txt size="caption" color={c.muted}>
                          Open Food Facts ·{" "}
                          {editor.food.brand || "Brand unavailable"} · Barcode{" "}
                          {editor.food.barcode}. Check against the package
                          label.
                        </Txt>
                        <Button
                          title="Enter label values instead"
                          variant="quiet"
                          disabled={!!pending}
                          onPress={() => setEditor({ ...editor, food: null })}
                        />
                      </>
                    )}
                    <Button
                      title="Save food"
                      onPress={save}
                      disabled={!!pending}
                      loading={pending === "Saving meal"}
                    />
                    <Button
                      title="Cancel"
                      variant="quiet"
                      disabled={!!pending}
                      onPress={() => {
                        setEditor(null);
                        setError("");
                      }}
                    />
                    {!!editor.original && (
                      <Button
                        title="Delete entry"
                        variant="danger"
                        disabled={!!pending}
                        onPress={remove}
                      />
                    )}
                  </SettingsSection>
                </>
              ) : (
                <>
                  <SettingsSection title="Daily intake">
                    {!entries.length ? (
                      <Empty
                        title="Your day starts here"
                        body="Add your first food to see today’s intake."
                      />
                    ) : (
                      <>
                        <Row style={{ gap: 16, flexWrap: "wrap" }}>
                          <Metric
                            small
                            label="Energy"
                            unit="kcal"
                            value={
                              totals.kcal.missing === entries.length
                                ? "—"
                                : `${display(totals.kcal.known)}${totals.kcal.missing ? "+" : ""}`
                            }
                          />
                          <Metric
                            small
                            label="Foods logged"
                            value={String(entries.length)}
                          />
                        </Row>
                        {nutrientKeys
                          .filter((key) => key !== "kcal")
                          .map((key) => (
                            <LabelValueRow
                              key={key}
                              label={titles[key]}
                              value={
                                totals[key].missing === entries.length
                                  ? "Unavailable"
                                  : `${display(totals[key].known)}${totals[key].missing ? " + unavailable" : ""}`
                              }
                            />
                          ))}
                        {nutrientKeys.some((k) => totals[k].missing > 0) && (
                          <Txt size="caption" color={c.muted}>
                            Known values only; unavailable nutrients stay blank.
                          </Txt>
                        )}
                      </>
                    )}
                    <Button
                      title="Add food"
                      onPress={() => open()}
                      disabled={!!pending || !validNutritionDay(day)}
                    />
                  </SettingsSection>
                  {!!entries.length && (
                    <SettingsSection title="More nutrients" collapsible>
                      {micronutrientKeys.map((key) => {
                        const value = additional[key],
                          definition = micronutrientDefinitions[key];
                        return (
                          <LabelValueRow
                            key={key}
                            label={definition.label}
                            value={
                              value.missing === entries.length
                                ? "Unavailable"
                                : `${display(value.known)} ${definition.unit}${value.missing ? " + unknown" : ""}`
                            }
                          />
                        );
                      })}
                      <Txt size="caption" color={c.muted}>
                        Package data only. Missing values are not zero.
                      </Txt>
                    </SettingsSection>
                  )}
                  {meals
                    .filter((group) =>
                      entries.some((entry) => entry.meal === group),
                    )
                    .map((group) => (
                      <SettingsSection
                        key={group}
                        title={`${title(group)} · ${entries.filter((entry) => entry.meal === group).length}`}
                      >
                        {entries
                          .filter((e) => e.meal === group)
                          .slice(0, visibleLimit)
                          .map((entry) => {
                            const n = entryNutrients(entry);
                            return (
                              <ListRow
                                key={entry.id}
                                title={entry.food.name}
                                detail={`${display(entry.grams)} g · ${n.kcal === null ? "Energy unavailable" : `${display(n.kcal)} kcal`} · ${entry.food.source === "manual" ? "Label entered" : "Open Food Facts"}`}
                                onPress={() => open(entry)}
                              />
                            );
                          })}
                        {entries.filter((e) => e.meal === group).length >
                          visibleLimit && (
                          <Button
                            title="Show more entries"
                            variant="quiet"
                            onPress={() => setVisibleLimit((n) => n + 50)}
                          />
                        )}
                      </SettingsSection>
                    ))}
                </>
              ))}

            <ListRow
              title="Daily targets & weekly report"
              detail="Review your logged intake in Insights"
              onPress={() => router.push("/nutrition-insights")}
            />
            <Button
              title="Food data: Open Food Facts (ODbL)"
              variant="quiet"
              onPress={() =>
                void Linking.openURL(
                  "https://world.openfoodfacts.org/data",
                ).catch((e) => setError(userMessage(e)))
              }
            />
          </>
        )}
      </Stack>
    </Screen>
  );
}

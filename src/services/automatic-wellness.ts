import type { Database } from "../storage/port";
import type { WellnessEntry } from "../domain/wellness";
import { validateWellnessEntry } from "../domain/wellness";
import type { HealthSnapshot } from "./health-types";
import { WellnessRepository } from "./wellness-repository";

/** Refresh existing canonical records, never add duplicate daily totals. */
export async function refreshAutomaticWellness(
  db: Database,
  ownerId: string,
  snapshot: HealthSnapshot,
  canCommit: () => boolean = () => true,
): Promise<number> {
  const now = Date.now();
  if (
    !canCommit() ||
    !["HealthKit", "Health Connect"].includes(snapshot.source) ||
    !Number.isFinite(snapshot.readAt) ||
    snapshot.readAt <= 0 ||
    snapshot.readAt > now + 60000
  )
    return 0;
  const date = new Date(snapshot.readAt),
    day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const provider = snapshot.source === "HealthKit" ? "hk" : "hc";
  const records: WellnessEntry[] = [];
  const add = (
    kind: WellnessEntry["kind"],
    value: number | null | undefined,
    recordId: string,
    at: number,
    windowStart?: number,
    windowEnd?: number,
  ) => {
    if (value === null || value === undefined) return;
    const entry: WellnessEntry = {
      id: `health-${provider}-${kind}-${encodeURIComponent(recordId)}`,
      ownerId,
      kind,
      value,
      at,
      note: "",
      source: {
        provider: snapshot.source,
        recordId,
        readAt: snapshot.readAt,
        windowStart,
        windowEnd,
      },
    };
    try {
      validateWellnessEntry(entry, now);
      records.push(entry);
    } catch {
      /* Invalid provider data never becomes a reading. */
    }
  };
  add(
    "steps",
    snapshot.steps,
    day,
    snapshot.readAt,
    snapshot.stepsStartedAt,
    snapshot.readAt,
  );
  const movementStart = snapshot.movementStartedAt;
  // Only a complete known local-day interval can become a daily movement total.
  const midnight = new Date(snapshot.readAt);
  midnight.setHours(0, 0, 0, 0);
  if (movementStart === midnight.getTime() && movementStart < snapshot.readAt) {
    add(
      "floorsClimbed",
      snapshot.floorsClimbed,
      day,
      snapshot.readAt,
      movementStart,
      snapshot.readAt,
    );
    add(
      "activeEnergy",
      snapshot.activeEnergyKcal,
      day,
      snapshot.readAt,
      movementStart,
      snapshot.readAt,
    );
  }
  // This is a labelled rolling 24-hour summary, not a fabricated sleep session.
  add(
    "sleep",
    snapshot.sleepHours,
    day,
    snapshot.readAt,
    snapshot.sleepStartedAt,
    snapshot.sleepEndedAt,
  );
  add(
    "weight",
    snapshot.weightKg,
    String(snapshot.weightMeasuredAt),
    snapshot.weightMeasuredAt ?? NaN,
  );
  const waterFrom = snapshot.stepsStartedAt ?? snapshot.readAt - 86400000;
  let waterComplete =
    !!snapshot.waterComplete &&
    Array.isArray(snapshot.water) &&
    snapshot.water.length <= 1000 &&
    Number.isFinite(waterFrom) &&
    waterFrom > 0 &&
    waterFrom < snapshot.readAt;
  const waterRecords = new Map<
    string,
    { id: string; at: number; ml: number }
  >();
  if (waterComplete) {
    for (const water of snapshot.water!) {
      if (
        !water ||
        typeof water.id !== "string" ||
        !water.id ||
        water.id.length > 300 ||
        !Number.isFinite(water.at) ||
        water.at > snapshot.readAt ||
        water.at < waterFrom ||
        !Number.isFinite(water.ml) ||
        Math.round(water.ml) < 10 ||
        Math.round(water.ml) > 5000
      ) {
        waterComplete = false;
        break;
      }
      const previous = waterRecords.get(water.id);
      if (previous && (previous.at !== water.at || previous.ml !== water.ml)) {
        waterComplete = false;
        break;
      }
      waterRecords.set(water.id, water);
    }
  }
  if (waterComplete)
    for (const water of waterRecords.values())
      add("water", Math.round(water.ml), water.id, water.at);
  return new WellnessRepository(db).importHealth(
    ownerId,
    records,
    canCommit,
    waterComplete
      ? {
          provider: snapshot.source,
          from: waterFrom,
          to: snapshot.readAt,
          readAt: snapshot.readAt,
        }
      : undefined,
  );
}

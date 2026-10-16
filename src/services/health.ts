import { AppFailure } from "../security/errors";
import { Platform } from "react-native";
import { hrvBaseline, asleepHours } from "./health-types";
import type { HealthProvider, HealthSnapshot } from "./health-types";
import {
  validateSleepRead,
  type SleepStage,
  type SleepHistoryRead,
  type SleepInterval,
} from "../domain/sleep-analysis";
export type { HealthSnapshot } from "./health-types";
export { recoveryInsight } from "./health-types";
async function readHealth(requestPermission: boolean): Promise<HealthSnapshot> {
  const readAt = Date.now();
  const day = new Date(readAt);
  day.setHours(0, 0, 0, 0);
  if (Platform.OS === "ios") {
    const hk = await import("@kingstinct/react-native-healthkit");
    if (!hk.isHealthDataAvailable())
      throw new AppFailure(
        "validation",
        "HealthKit is unavailable on this device.",
      );
    if (requestPermission)
      await hk.requestAuthorization({
        toRead: [
          "HKQuantityTypeIdentifierHeartRate",
          "HKQuantityTypeIdentifierRestingHeartRate",
          "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          "HKCategoryTypeIdentifierSleepAnalysis",
          "HKQuantityTypeIdentifierStepCount",
          "HKQuantityTypeIdentifierBodyMass",
          "HKQuantityTypeIdentifierDietaryWater",
          "HKQuantityTypeIdentifierFlightsClimbed",
          "HKQuantityTypeIdentifierActiveEnergyBurned",
        ],
      });
    const filter = {
        date: {
          startDate: new Date(readAt - 28 * 86400000),
          endDate: new Date(readAt),
        },
      },
      [hrv, hr, sleep, steps, weight] = await Promise.all([
        hk.queryQuantitySamples(
          "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          { unit: "ms", limit: 1000, ascending: false, filter },
        ),
        hk.queryQuantitySamples("HKQuantityTypeIdentifierRestingHeartRate", {
          unit: "count/min",
          limit: 1,
          ascending: false,
          filter,
        }),
        hk.queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", {
          limit: 2000,
          ascending: false,
          filter: {
            date: {
              startDate: new Date(readAt - 86400000),
              endDate: new Date(readAt),
            },
          },
        }),
        hk
          .queryStatisticsForQuantity(
            "HKQuantityTypeIdentifierStepCount",
            ["cumulativeSum"],
            {
              unit: "count",
              filter: { date: { startDate: day, endDate: new Date(readAt) } },
            },
          )
          .catch(() => null),
        hk
          .queryQuantitySamples("HKQuantityTypeIdentifierBodyMass", {
            unit: "kg",
            limit: 1,
            ascending: false,
          })
          .catch(() => []),
      ]);
    const [floors, activeEnergy] = await Promise.all([
      hk
        .queryStatisticsForQuantity(
          "HKQuantityTypeIdentifierFlightsClimbed",
          ["cumulativeSum"],
          {
            unit: "count",
            filter: { date: { startDate: day, endDate: new Date(readAt) } },
          },
        )
        .catch(() => null),
      hk
        .queryStatisticsForQuantity(
          "HKQuantityTypeIdentifierActiveEnergyBurned",
          ["cumulativeSum"],
          {
            unit: "kcal",
            filter: { date: { startDate: day, endDate: new Date(readAt) } },
          },
        )
        .catch(() => null),
    ]);
    const water = await hk
      .queryQuantitySamples("HKQuantityTypeIdentifierDietaryWater", {
        unit: "mL",
        limit: 1001,
        ascending: false,
        filter: { date: { startDate: day, endDate: new Date(readAt) } },
      })
      .catch(() => null);
    return {
      source: "HealthKit",
      readAt: readAt,
      stepsStartedAt: day.getTime(),
      movementStartedAt: day.getTime(),
      sleepStartedAt: readAt - 86400000,
      sleepEndedAt: readAt,
      water: water?.slice(0, 1000).map((s) => ({
        id: s.uuid,
        at: s.startDate.getTime(),
        ml: s.quantity,
      })),
      waterComplete: water !== null && water.length <= 1000,
      hrvReadings: hrv.map((s) => ({
        id: s.uuid,
        at: s.startDate.getTime(),
        value: s.quantity,
        method: "SDNN" as const,
      })),
      restingHR: hr[0]?.quantity ?? null,
      steps: steps?.sumQuantity?.quantity ?? null,
      floorsClimbed: floors?.sumQuantity?.quantity ?? null,
      activeEnergyKcal: activeEnergy?.sumQuantity?.quantity ?? null,
      weightKg: weight[0]?.quantity ?? null,
      weightMeasuredAt: weight[0]?.startDate.getTime() ?? null,
      ...hrvBaseline(
        hrv.map((s) => ({ t: s.startDate.getTime(), value: s.quantity })),
      ),
      sleepHours:
        sleep.length >= 2000
          ? null
          : asleepHours(
              sleep
                .filter((s) => [1, 3, 4, 5].includes(s.value))
                .map((s) => ({
                  start: s.startDate.getTime(),
                  end: s.endDate.getTime(),
                })),
              readAt - 86400000,
              readAt,
            ),
    };
  }
  if (Platform.OS === "android") {
    const hc = await import("react-native-health-connect");
    if (!(await hc.initialize()))
      throw new AppFailure(
        "validation",
        "Install or update Health Connect to continue.",
      );
    const granted = requestPermission
      ? await hc.requestPermission([
          { accessType: "read", recordType: "HeartRate" },
          { accessType: "read", recordType: "RestingHeartRate" },
          { accessType: "read", recordType: "HeartRateVariabilityRmssd" },
          { accessType: "read", recordType: "SleepSession" },
          { accessType: "read", recordType: "Steps" },
          { accessType: "read", recordType: "Weight" },
          { accessType: "read", recordType: "Hydration" },
          { accessType: "read", recordType: "FloorsClimbed" },
          { accessType: "read", recordType: "ActiveCaloriesBurned" },
        ])
      : (await hc.getGrantedPermissions()).filter(
          (p) => "accessType" in p && p.accessType === "read",
        );
    const options = {
        timeRangeFilter: {
          operator: "between" as const,
          startTime: new Date(readAt - 28 * 86400000).toISOString(),
          endTime: new Date(readAt).toISOString(),
        },
      },
      [hrv, hr, sleep, steps, weight, floors, activeEnergy] = await Promise.all(
        [
          granted.some((p) => p.recordType === "HeartRateVariabilityRmssd")
            ? hc.readRecords("HeartRateVariabilityRmssd", options)
            : Promise.resolve({ records: [] }),
          granted.some((p) => p.recordType === "RestingHeartRate")
            ? hc.readRecords("RestingHeartRate", options)
            : Promise.resolve({ records: [] }),
          granted.some((p) => p.recordType === "SleepSession")
            ? hc.readRecords("SleepSession", {
                timeRangeFilter: {
                  operator: "between",
                  startTime: new Date(readAt - 86400000).toISOString(),
                  endTime: new Date(readAt).toISOString(),
                },
              })
            : Promise.resolve({ records: [] }),
          granted.some((p) => p.recordType === "Steps")
            ? hc
                .aggregateRecord({
                  recordType: "Steps",
                  timeRangeFilter: {
                    operator: "between",
                    startTime: day.toISOString(),
                    endTime: new Date(readAt).toISOString(),
                  },
                })
                .catch(() => null)
            : Promise.resolve(null),
          granted.some((p) => p.recordType === "Weight")
            ? hc.readRecords("Weight", options).catch(() => ({ records: [] }))
            : Promise.resolve({ records: [] }),
          granted.some((p) => p.recordType === "FloorsClimbed")
            ? hc
                .aggregateRecord({
                  recordType: "FloorsClimbed",
                  timeRangeFilter: {
                    operator: "between",
                    startTime: day.toISOString(),
                    endTime: new Date(readAt).toISOString(),
                  },
                })
                .catch(() => null)
            : Promise.resolve(null),
          granted.some((p) => p.recordType === "ActiveCaloriesBurned")
            ? hc
                .aggregateRecord({
                  recordType: "ActiveCaloriesBurned",
                  timeRangeFilter: {
                    operator: "between",
                    startTime: day.toISOString(),
                    endTime: new Date(readAt).toISOString(),
                  },
                })
                .catch(() => null)
            : Promise.resolve(null),
        ],
      ),
      samples = [...hrv.records].sort((a, b) => b.time.localeCompare(a.time)),
      latestWeight = [...weight.records].sort((a, b) =>
        b.time.localeCompare(a.time),
      )[0],
      kg = latestWeight?.weight.inKilograms ?? null;
    const water = granted.some((p) => p.recordType === "Hydration")
      ? await hc
          .readRecords("Hydration", {
            timeRangeFilter: {
              operator: "between",
              startTime: day.toISOString(),
              endTime: new Date(readAt).toISOString(),
            },
            pageSize: 1000,
          })
          .catch(() => null)
      : null;
    return {
      source: "Health Connect",
      readAt: readAt,
      stepsStartedAt: day.getTime(),
      movementStartedAt: day.getTime(),
      sleepStartedAt: readAt - 86400000,
      sleepEndedAt: readAt,
      water: water?.records
        .filter((s) => !!s.metadata?.id)
        .map((s) => ({
          id: s.metadata!.id!,
          at: Date.parse(s.endTime),
          ml: s.volume.inMilliliters,
        })),
      waterComplete: water !== null && !water.pageToken,
      steps: steps?.dataOrigins.length ? steps.COUNT_TOTAL : null,
      floorsClimbed: floors?.dataOrigins.length
        ? floors.FLOORS_CLIMBED_TOTAL
        : null,
      activeEnergyKcal: activeEnergy?.dataOrigins.length
        ? activeEnergy.ACTIVE_CALORIES_TOTAL.inKilocalories
        : null,
      hrvReadings: samples
        .filter((s) => !!s.metadata?.id)
        .map((s) => ({
          id: s.metadata!.id!,
          at: Date.parse(s.time),
          value: s.heartRateVariabilityMillis,
          method: "RMSSD" as const,
        })),
      weightKg: kg,
      weightMeasuredAt: latestWeight ? Date.parse(latestWeight.time) : null,
      restingHR:
        [...hr.records].sort((a, b) => b.time.localeCompare(a.time))[0]
          ?.beatsPerMinute ?? null,
      ...hrvBaseline(
        samples.map((s) => ({
          t: Date.parse(s.time),
          value: s.heartRateVariabilityMillis,
        })),
      ),
      sleepHours:
        "pageToken" in sleep && sleep.pageToken
          ? null
          : asleepHours(
              sleep.records.flatMap((r) =>
                (r.stages ?? [])
                  .filter((s) => [2, 4, 5, 6].includes(s.stage))
                  .map((s) => ({
                    start: Date.parse(s.startTime),
                    end: Date.parse(s.endTime),
                  })),
              ),
              readAt - 86400000,
              readAt,
            ),
    };
  }
  throw new AppFailure(
    "validation",
    "Connect health data in the native iOS or Android app.",
  );
}
export const health: HealthProvider = {
  connect: () => readHealth(true),
  refresh: () => readHealth(false),
  sleepHistory: (days) => boundedSleepRead(days),
  async heartRate(start, end) {
    if (Platform.OS === "ios") {
      const hk = await import("@kingstinct/react-native-healthkit"),
        samples = await hk.queryQuantitySamples(
          "HKQuantityTypeIdentifierHeartRate",
          {
            unit: "count/min",
            limit: 10000,
            ascending: true,
            filter: {
              date: { startDate: new Date(start), endDate: new Date(end) },
            },
          },
        );
      return samples.map((s) => ({ t: s.startDate.getTime(), hr: s.quantity }));
    }
    if (Platform.OS === "android") {
      const hc = await import("react-native-health-connect"),
        result = await hc.readRecords("HeartRate", {
          timeRangeFilter: {
            operator: "between",
            startTime: new Date(start).toISOString(),
            endTime: new Date(end).toISOString(),
          },
        });
      return result.records.flatMap((r) =>
        r.samples.map((s) => ({
          t: new Date(s.time).getTime(),
          hr: s.beatsPerMinute,
        })),
      );
    }
    return [];
  },
};

async function boundedSleepRead(days: 7 | 30): Promise<SleepHistoryRead> {
  if (days !== 7 && days !== 30)
    throw new AppFailure("validation", "Choose 7 or 30 days of sleep history.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readSleepHistory(days),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppFailure(
                "timeout",
                "Sleep history took too long to load. Previous history is unchanged.",
              ),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function readSleepHistory(days: 7 | 30): Promise<SleepHistoryRead> {
  const readAt = Date.now(),
    from = readAt - days * 86400000,
    to = readAt,
    intervals: SleepInterval[] = [];
  if (Platform.OS === "ios") {
    const hk = await import("@kingstinct/react-native-healthkit");
    if (!hk.isHealthDataAvailable())
      throw new AppFailure(
        "validation",
        "HealthKit is unavailable on this device.",
      );
    const records = await hk.queryCategorySamples(
      "HKCategoryTypeIdentifierSleepAnalysis",
      {
        limit: 5001,
        ascending: false,
        filter: { date: { startDate: new Date(from), endDate: new Date(to) } },
      },
    );
    if (records.length > 5000)
      throw new AppFailure(
        "validation",
        "Too many sleep records to read completely. Choose 7 days. Previous history is unchanged.",
      );
    const stageMap: Record<number, SleepStage> = {
      0: "in_bed",
      1: "asleep",
      2: "awake",
      3: "core",
      4: "deep",
      5: "rem",
    };
    for (const r of records)
      intervals.push({
        id: r.uuid,
        start: r.startDate.getTime(),
        end: r.endDate.getTime(),
        stage: stageMap[r.value] ?? "unknown",
        sourceName: r.sourceRevision?.source?.name || "HealthKit",
      });
    return validateSleepRead({
      provider: "HealthKit",
      readAt,
      from,
      to,
      complete: true,
      intervals,
    });
  }
  if (Platform.OS === "android") {
    const hc = await import("react-native-health-connect");
    if (!(await hc.initialize()))
      throw new AppFailure(
        "validation",
        "Install or update Health Connect to read sleep history.",
      );
    if (
      !(await hc.getGrantedPermissions()).some(
        (p) =>
          "accessType" in p &&
          p.accessType === "read" &&
          p.recordType === "SleepSession",
      )
    )
      throw new AppFailure(
        "validation",
        "Allow sleep access in Health Connect, then refresh.",
      );
    const stageMap: Record<number, SleepStage> = {
        0: "unknown",
        1: "awake",
        2: "asleep",
        3: "awake",
        4: "light",
        5: "deep",
        6: "rem",
        7: "awake",
      },
      tokens = new Set<string>();
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await hc.readRecords("SleepSession", {
        timeRangeFilter: {
          operator: "between",
          startTime: new Date(from).toISOString(),
          endTime: new Date(to).toISOString(),
        },
        pageSize: 100,
        pageToken: token,
      });
      if (result.records.length > 100)
        throw new AppFailure(
          "validation",
          "Sleep history exceeded its page bound. Previous history is unchanged.",
        );
      for (const r of result.records) {
        const id = r.metadata?.id,
          sourceName = r.metadata?.dataOrigin || "Health Connect";
        if (!id)
          throw new AppFailure(
            "validation",
            "A sleep record has no stable identity. Previous history is unchanged.",
          );
        const start = Date.parse(r.startTime),
          end = Date.parse(r.endTime);
        intervals.push({
          id: id + ":session",
          start,
          end,
          stage: "unknown",
          sourceName,
        });
        if ((r.stages?.length ?? 0) > 5000)
          throw new AppFailure(
            "validation",
            "Too many sleep stages. Previous history is unchanged.",
          );
        for (let i = 0; i < (r.stages?.length ?? 0); i++) {
          const s = r.stages![i]!,
            a = Date.parse(s.startTime),
            b = Date.parse(s.endTime);
          if (
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            a < start ||
            b > end ||
            b <= a
          )
            throw new AppFailure(
              "validation",
              "A sleep stage lies outside its session. Previous history is unchanged.",
            );
          intervals.push({
            id: id + ":stage:" + i,
            start: a,
            end: b,
            stage: stageMap[s.stage] ?? "unknown",
            sourceName,
          });
        }
      }
      if (intervals.length > 5000)
        throw new AppFailure(
          "validation",
          "Too many sleep records to read completely. Choose 7 days. Previous history is unchanged.",
        );
      if (!result.pageToken)
        return validateSleepRead({
          provider: "Health Connect",
          readAt,
          from,
          to,
          complete: true,
          intervals,
        });
      if (tokens.has(result.pageToken))
        throw new AppFailure(
          "validation",
          "Sleep history did not finish loading. Previous history is unchanged.",
        );
      tokens.add(result.pageToken);
      token = result.pageToken;
    }
    throw new AppFailure(
      "validation",
      "Too many sleep sessions to read completely. Choose 7 days. Previous history is unchanged.",
    );
  }
  throw new AppFailure(
    "validation",
    "Read sleep history in the native iOS or Android app.",
  );
}

import type { Activity, Sample, Summary } from "./types";
import { AppFailure } from "../security/errors";
import { numeric, textInput } from "../security/validation";
import { isValidHeartRateZoneThresholds } from "./heart-rate-zones";

function invalid(): never {
  throw new AppFailure(
    "validation",
    "Cloud activity data is invalid. Sync stopped before advancing its cursor.",
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value;
}
function n(value: unknown, max = 1e12, min = 0): number {
  return numeric(value, "Cloud activity metric", min, max);
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const result = n(value, max);
  if (!Number.isSafeInteger(result)) invalid();
  return result;
}
function nullable(value: unknown, max: number, min = 0): number | null {
  return value === null ? null : n(value, max, min);
}
/** IDs are restricted to characters safe in both object paths and keyset filters. */
export function remoteIdentifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    invalid();
  return value;
}
export function remoteTimestamp(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    invalid();
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < 0) invalid();
  return time;
}
/** Postgres timestamps can distinguish microseconds even when JS dates cannot. */
export function compareRemoteTimestamps(a: string, b: string): number {
  const fraction = (value: string) =>
    (value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6);
  return (
    remoteTimestamp(a) - remoteTimestamp(b) ||
    fraction(a).localeCompare(fraction(b))
  );
}
function summary(value: unknown): Summary {
  const s = object(value);
  const result: Summary = {
    distance: n(s.distance),
    elapsed: n(s.elapsed),
    moving: n(s.moving),
    ascent: n(s.ascent),
    descent: n(s.descent),
    avgPace: n(s.avgPace),
    avgSpeed: n(s.avgSpeed),
    avgHR: nullable(s.avgHR, 240, 30),
    maxHR: nullable(s.maxHR, 240, 30),
    avgPower: nullable(s.avgPower, 100000),
    load: n(s.load),
    loadMethod:
      s.loadMethod === "hr-zones" || s.loadMethod === "duration-rpe"
        ? s.loadMethod
        : invalid(),
    zones: list(s.zones, 5).map((v) => n(v)),
    splits: list(s.splits, 10000).map((value) => {
      const split = object(value);
      return {
        km: n(split.km),
        distance: n(split.distance),
        seconds: n(split.seconds),
        pace: n(split.pace),
        ascent: n(split.ascent),
      };
    }),
    bests: list(s.bests, 1000).map((value) => {
      const effort = object(value);
      const start = integer(effort.start),
        end = integer(effort.end);
      if (end < start) invalid();
      return {
        distance: n(effort.distance),
        seconds: n(effort.seconds),
        start,
        end,
      };
    }),
    gap: nullable(s.gap, 1e12),
    rejected: integer(s.rejected),
  };
  if (result.zones.length !== 5) invalid();
  if (s.hrZoneMaxHR !== undefined)
    result.hrZoneMaxHR = n(s.hrZoneMaxHR, 240, 100);
  if (s.hrZoneThresholds !== undefined) {
    if (
      !isValidHeartRateZoneThresholds(
        s.hrZoneThresholds,
        result.hrZoneMaxHR ?? 240,
      )
    )
      invalid();
    result.hrZoneThresholds = [...s.hrZoneThresholds];
  }
  if (s.laps !== undefined)
    result.laps = list(s.laps, 10000).map((value) => {
      const lap = object(value);
      const start = n(lap.start),
        end = n(lap.end);
      if (end < start) invalid();
      return {
        start,
        end,
        distance: n(lap.distance),
        seconds: n(lap.seconds),
        ascent: n(lap.ascent),
        avgHR: nullable(lap.avgHR, 240, 30),
        avgPower: nullable(lap.avgPower, 100000),
      };
    });
  return result;
}
export function decodeRemoteActivity(
  value: unknown,
  ownerId: string,
): { activity: Activity; updatedAt: string; updatedTime: number } {
  const row = object(value),
    id = remoteIdentifier(row.id);
  if (remoteIdentifier(row.owner_id) !== ownerId) invalid();
  const startedAt = remoteTimestamp(row.started_at),
    endedAt = remoteTimestamp(row.ended_at);
  const updatedTime = remoteTimestamp(row.updated_at);
  if (endedAt < startedAt) invalid();
  if (
    !["run", "ride", "walk", "hike"].includes(String(row.sport)) ||
    !["private", "friends", "public"].includes(String(row.visibility))
  )
    invalid();
  const route: Sample[] = list(row.display_route ?? [], 12000).map((value) => {
    const p = object(value);
    const t = n(p.t, endedAt, startedAt);
    const point: Sample = {
      lat: n(p.lat, 90, -90),
      lng: n(p.lng, 180, -180),
      t,
      accuracy: n(p.accuracy, 100000),
      segment: integer(p.segment),
    };
    if (p.altitude !== undefined)
      point.altitude = n(p.altitude, 100000, -10000);
    if (p.hr !== undefined) point.hr = n(p.hr, 240, 30);
    if (p.watts !== undefined) point.watts = n(p.watts, 100000);
    return point;
  });
  const photoKeys = list(row.photo_keys ?? [], 20).map((value) => {
    if (typeof value !== "string" || value.length > 512) invalid();
    const parts = value.split("/");
    if (
      parts.length !== 3 ||
      parts[0] !== ownerId ||
      parts[1] !== id ||
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:jpg|jpeg|png|heic|webp)$/i.test(
        parts[2]!,
      ) ||
      parts[2]!.includes("..")
    )
      invalid();
    return value;
  });
  return {
    activity: {
      id,
      ownerId,
      title: textInput(row.title, "Activity title", 200),
      sport: row.sport as Activity["sport"],
      visibility: row.visibility as Activity["visibility"],
      startedAt,
      endedAt,
      summary: summary(row.summary),
      route,
      note: textInput(row.note, "Activity note", 10000, false),
      rpe: n(row.rpe, 10, 1),
      revision: integer(row.revision, 2147483647),
      sync: "synced",
      photos: [],
      photoKeys,
    },
    updatedAt: row.updated_at as string,
    updatedTime,
  };
}

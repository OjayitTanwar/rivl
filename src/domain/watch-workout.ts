import type { Sample, Sport, Activity, Profile } from "./types";
import { validSample, simplify, routeLines } from "./geo";
import { processActivity } from "./processing";
import { recordedLaps } from "./activity-ranges";
import { identifier } from "../security/validation";
import { AppFailure } from "../security/errors";
export function decodeWatchWorkout(
  value: unknown,
  profile: Profile,
  now = Date.now(),
): { activity: Activity; points: Sample[] } {
  const data = value as {
    version: number;
    id: string;
    ownerId: string;
    sport: Sport;
    startedAt: number;
    endedAt: number;
    points: Sample[];
    laps: number[];
  };
  const reject = () => {
    throw new AppFailure(
      "validation",
      "This watch workout is incomplete or belongs to another athlete.",
    );
  };
  if (
    !data ||
    data.version !== 1 ||
    data.ownerId !== profile.id ||
    !["run", "ride", "walk", "hike"].includes(data.sport)
  )
    reject();
  identifier(data.id, "Watch workout ID");
  if (
    !Number.isFinite(data.startedAt) ||
    !Number.isFinite(data.endedAt) ||
    data.startedAt <= 0 ||
    data.endedAt <= data.startedAt ||
    data.endedAt > now + 60000 ||
    data.endedAt - data.startedAt > 7 * 86400000 ||
    !Array.isArray(data.points) ||
    data.points.length < 2 ||
    data.points.length > 100000
  )
    reject();
  let last = data.startedAt - 1;
  const points = data.points.map((raw) => {
    if (!raw || typeof raw !== "object") reject();
    const p: Sample = {
      lat: raw.lat,
      lng: raw.lng,
      t: raw.t,
      accuracy: raw.accuracy,
      altitude: raw.altitude,
      hr: raw.hr ?? undefined,
      watts: raw.watts ?? undefined,
      segment: raw.segment,
    };
    if (
      !validSample(p) ||
      !Number.isInteger(p.segment) ||
      p.segment < 0 ||
      p.t <= last ||
      p.t < data.startedAt ||
      p.t > data.endedAt ||
      (p.hr !== undefined &&
        (!Number.isFinite(p.hr) || p.hr < 30 || p.hr > 240)) ||
      (p.watts !== undefined &&
        (!Number.isFinite(p.watts) || p.watts < 0 || p.watts > 5000)) ||
      (p.altitude !== undefined &&
        (!Number.isFinite(p.altitude) ||
          p.altitude < -500 ||
          p.altitude > 10000))
    )
      reject();
    last = p.t;
    return p;
  });
  if (
    !Array.isArray(data.laps) ||
    data.laps.length > 1000 ||
    data.laps.some(
      (t) => !Number.isFinite(t) || t < data.startedAt || t > data.endedAt,
    )
  )
    reject();
  const summary = processActivity(
    points,
    data.sport,
    data.startedAt,
    data.endedAt,
    profile.maxHR,
    4,
    profile.hrZoneThresholds,
  );
  summary.laps = recordedLaps(points, data.laps, data.sport, profile.maxHR);
  const route = routeLines(points).flatMap((line) => simplify(line));
  return {
    points,
    activity: {
      id: data.id.toLowerCase(),
      ownerId: profile.id,
      title: "Watch " + data.sport,
      sport: data.sport,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      summary,
      route,
      visibility: "private",
      note: "Recorded on Apple Watch",
      rpe: 4,
      sync: "local",
      revision: 1,
      photos: [],
    },
  };
}

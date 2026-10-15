import type { Sport } from "../domain/types";
import { database } from "../storage/database";
export interface AutoRecordPreferences {
  enabled: boolean;
  sport: Sport;
}
const listeners = new Set<() => void>();
export const onAutoRecordChange = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export async function autoRecordPreferences(
  owner: string,
): Promise<AutoRecordPreferences> {
  const value = await database.get<AutoRecordPreferences>(
    "auto-record:" + owner,
  );
  return value && ["run", "ride", "walk", "hike"].includes(value.sport)
    ? { sport: value.sport, enabled: value.enabled === true }
    : { enabled: false, sport: "run" };
}
export async function saveAutoRecordPreferences(
  owner: string,
  value: AutoRecordPreferences,
) {
  await database.set("auto-record:" + owner, value);
  for (const listener of listeners) listener();
}

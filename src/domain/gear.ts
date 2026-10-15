import type { Activity, Sport } from "./types";
export type GearType = "shoes" | "bike";
export interface Gear {
  id: string;
  ownerId: string;
  name: string;
  type: GearType;
  initialMeters: number;
  addedAt: number;
  retired: boolean;
  isDefault: boolean;
}
export interface GearAssignment {
  ownerId: string;
  activityId: string;
  gearId: string;
}
export const gearTypeForSport = (sport: Sport): GearType =>
  sport === "ride" ? "bike" : "shoes";
export function validGear(gear: Gear): Gear {
  if (
    !gear.id ||
    gear.id.includes(":") ||
    !gear.ownerId ||
    gear.ownerId.includes(":")
  )
    throw new Error("Sign in to save gear.");
  const name = gear.name.trim();
  if (name.length < 2 || name.length > 60)
    throw new Error("Give your gear a name of 2–60 characters.");
  if (gear.type !== "shoes" && gear.type !== "bike")
    throw new Error("Choose shoes or a bike.");
  if (
    !Number.isFinite(gear.initialMeters) ||
    gear.initialMeters < 0 ||
    gear.initialMeters > 100000000
  )
    throw new Error(
      "Enter a valid starting distance between 0 and 100,000 km.",
    );
  if (!Number.isFinite(gear.addedAt) || gear.addedAt <= 0)
    throw new Error("Choose a valid added date.");
  return { ...gear, name, isDefault: gear.retired ? false : gear.isDefault };
}
export function gearStats(
  gear: Gear,
  assignments: GearAssignment[],
  activities: Activity[],
) {
  const ids = new Set(
    assignments
      .filter((a) => a.ownerId === gear.ownerId && a.gearId === gear.id)
      .map((a) => a.activityId),
  );
  const seen = new Set<string>();
  const recorded = activities.filter((a) => {
    if (
      seen.has(a.id) ||
      a.ownerId !== gear.ownerId ||
      a.demo ||
      a.simulated ||
      !ids.has(a.id) ||
      gearTypeForSport(a.sport) !== gear.type ||
      !Number.isFinite(a.summary.distance) ||
      a.summary.distance < 0
    )
      return false;
    seen.add(a.id);
    return true;
  });
  return {
    meters:
      gear.initialMeters +
      recorded.reduce((sum, a) => sum + a.summary.distance, 0),
    activities: recorded.length,
  };
}

import type { Profile } from "../domain/types";
export function defaultProfile(
  id: string,
  name = "Athlete",
  demo = false,
): Profile {
  return {
    id,
    name,
    handle:
      name
        .toLowerCase()
        .replace(/[^a-z0-9._]/g, "")
        .slice(0, 30) || "athlete",
    bio: "One more good day outside.",
    maxHR: 190,
    restingHR: 55,
    weeklyGoal: 40000,
    visibility: "private",
    theme: "system",
    highContrast: false,
    autoPause: true,
    privacyZones: [],
    demo,
  };
}

import { AppFailure } from "./errors";
import type { PrivacyZone, Profile } from "../domain/types";
import { isValidHeartRateZoneThresholds } from "../domain/heart-rate-zones";
const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
export function textInput(
  value: unknown,
  label: string,
  max: number,
  required = true,
): string {
  if (typeof value !== "string")
    throw new AppFailure("validation", `${label} must be text.`);
  const text = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (controls.test(text) || /[\u202A-\u202E\u2066-\u2069]/u.test(text))
    throw new AppFailure(
      "validation",
      `${label} contains unsupported control characters.`,
    );
  if ((required && !text) || [...text].length > max)
    throw new AppFailure(
      "validation",
      `${label} must contain ${required ? "1" : "0"}–${max} characters.`,
    );
  return text;
}
export function emailInput(value: unknown): string {
  const email = textInput(value, "Email", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new AppFailure("validation", "Enter a valid email address.");
  const at = email.lastIndexOf("@");
  return email.slice(0, at) + email.slice(at).toLowerCase();
}
export function passwordInput(value: unknown, signup: boolean): string {
  if (
    typeof value !== "string" ||
    value.length < (signup ? 12 : 1) ||
    value.length > 128
  )
    throw new AppFailure(
      "validation",
      signup
        ? "Use 12–128 characters for your password."
        : "Enter your password (up to 128 characters).",
    );
  return value;
}
export function identifier(value: unknown, label = "ID"): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new AppFailure("validation", `${label} is invalid.`);
  return value;
}
export function numeric(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new AppFailure(
      "validation",
      `${label} must be between ${min} and ${max}.`,
    );
  return value;
}
export function privacyZone(zone: PrivacyZone): PrivacyZone {
  return {
    id: identifier(zone.id, "Privacy zone"),
    label: textInput(zone.label, "Zone name", 100),
    lat: numeric(zone.lat, "Latitude", -90, 90),
    lng: numeric(zone.lng, "Longitude", -180, 180),
    radius: numeric(zone.radius, "Privacy radius", 200, 10000),
  };
}
export function profileInput(profile: Profile): Profile {
  if (
    profile.hrZoneThresholds != null &&
    !isValidHeartRateZoneThresholds(profile.hrZoneThresholds, profile.maxHR)
  )
    throw new AppFailure(
      "validation",
      "Enter four increasing whole-number heart-rate boundaries from 30 bpm up to your maximum heart rate.",
    );
  if (
    profile.leaderboardGender != null &&
    !["women", "men", "nonbinary"].includes(profile.leaderboardGender)
  )
    throw new AppFailure(
      "validation",
      "Choose a valid optional gender category.",
    );
  if (
    profile.speedUnit !== undefined &&
    !["kmh", "mph"].includes(profile.speedUnit)
  )
    throw new AppFailure("validation", "Choose km/h or mph.");
  if (profile.birthYear != null && !Number.isInteger(profile.birthYear))
    throw new AppFailure("validation", "Birth year must be a whole year.");
  if (!["private", "friends", "public"].includes(profile.visibility))
    throw new AppFailure("validation", "Choose a valid activity visibility.");
  if (!["system", "light", "dark"].includes(profile.theme))
    throw new AppFailure("validation", "Choose a valid appearance.");
  if (profile.accentColor !== undefined &&
      !["orange", "blue", "purple", "green", "teal", "pink"].includes(profile.accentColor))
    throw new AppFailure("validation", "Choose a valid accent colour.");
  if (!Array.isArray(profile.privacyZones) || profile.privacyZones.length > 50)
    throw new AppFailure("validation", "You can save up to 50 privacy zones.");
  const handle = textInput(profile.handle, "Handle", 30);
  if (!/^[a-zA-Z0-9._]+$/.test(handle))
    throw new AppFailure(
      "validation",
      "Use letters, numbers, dots or underscores in your handle.",
    );
  return {
    ...profile,
    name: textInput(profile.name, "Name", 100),
    handle,
    bio: textInput(profile.bio, "Bio", 1000, false),
    maxHR: numeric(profile.maxHR, "Maximum heart rate", 100, 240),
    hrZoneThresholds:
      profile.hrZoneThresholds == null ? null : [...profile.hrZoneThresholds],
    ftp:
      profile.ftp == null
        ? null
        : numeric(profile.ftp, "Functional threshold power", 50, 1000),
    weightKg:
      profile.weightKg == null
        ? null
        : numeric(profile.weightKg, "Body weight", 25, 300),
    birthYear:
      profile.birthYear == null
        ? null
        : numeric(
            profile.birthYear,
            "Birth year",
            1900,
            new Date().getFullYear(),
          ),
    segmentParticipation: profile.segmentParticipation === true,
    shareLeaderboardAge: profile.shareLeaderboardAge === true,
    shareLeaderboardWeight: profile.shareLeaderboardWeight === true,
    leaderboardGender: profile.leaderboardGender ?? null,
    shareLeaderboardGender:
      profile.leaderboardGender != null &&
      profile.shareLeaderboardGender === true,
    restingHR: numeric(profile.restingHR, "Resting heart rate", 30, 150),
    weeklyGoal: numeric(
      profile.weeklyGoal,
      "Weekly distance goal",
      1000,
      2000000,
    ),
    privacyZones: profile.privacyZones.map(privacyZone),
  };
}

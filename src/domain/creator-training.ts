import { AppFailure } from "../security/errors";
import {
  trainingSports,
  validateTrainingPlan,
  type TrainingPlan,
  type TrainingSport,
} from "./guided-training";
export type CreatorWorkout = Pick<
  TrainingPlan,
  "warmupSec" | "workSec" | "recoverySec" | "repeats" | "cooldownSec"
>;
export type CreatorSession = {
  id: string;
  week: number;
  day: number;
  title: string;
  notes: string;
  workout: CreatorWorkout;
};
export type CreatorLicense = "CC-BY-4.0" | "CC0-1.0";
export type CreatorLevel = "beginner" | "intermediate" | "advanced" | "all";
export type CreatorAttribution = {
  creatorName: string;
  title: string;
  license: CreatorLicense;
};
export type CreatorProgramOrigin = {
  creatorName: string;
  title: string;
  revision: number;
  license: CreatorLicense;
  importedAt: number;
  attribution?: CreatorAttribution[];
};
export type CreatorProgram = {
  id: string;
  ownerId: string;
  creatorName: string;
  title: string;
  description: string;
  sport: TrainingSport;
  level: CreatorLevel;
  weeks: number;
  revision: number;
  updatedAt: number;
  license: CreatorLicense;
  sessions: CreatorSession[];
  origin?: CreatorProgramOrigin;
};
export type PublicCreatorProgram = Omit<
  CreatorProgram,
  "id" | "ownerId" | "origin"
> & { attribution?: CreatorAttribution[] };
export const CREATOR_PROGRAM_LIMITS = {
  maxPrograms: 50,
  maxSessions: 100,
  maxWeeks: 24,
  maxImportBytes: 200000,
} as const;
const fail = (message: string): never => {
  throw new AppFailure("validation", message);
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Choose a valid training program.");
  return value as Record<string, unknown>;
};
const text = (
  value: unknown,
  label: string,
  max: number,
  allowEmpty = false,
) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  )
    fail(
      `${label} must be ${allowEmpty ? "up to" : "between 1 and"} ${max} characters.`,
    );
  return (value as string).trim();
};
const identifier = (value: unknown, label: string) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value))
    fail(`Choose a valid ${label}.`);
  return value as string;
};
const integer = (value: unknown, label: string, min: number, max: number) => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(`${label} must be a whole number from ${min} to ${max}.`);
  return value as number;
};
const timestamp = (value: unknown) => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 8640000000000000
  )
    fail("Choose a valid program date.");
  return value as number;
};
const license = (value: unknown): CreatorLicense => {
  if (value !== "CC-BY-4.0" && value !== "CC0-1.0")
    fail("Choose CC BY 4.0 or CC0 1.0 before sharing your program.");
  return value as CreatorLicense;
};
export function validateCreatorOwner(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 120 ||
    value.includes(":")
  )
    fail("Sign in to keep creator programs.");
  return value as string;
}
function attributions(value: unknown): CreatorAttribution[] {
  if (!Array.isArray(value) || value.length > 100)
    fail("Use at most 20 creator attribution records.");
  const unique = new Map<string, CreatorAttribution>();
  for (const raw of value as unknown[]) {
    const source = record(raw),
      item = {
        creatorName: text(source.creatorName, "Attributed creator name", 80),
        title: text(source.title, "Attributed title", 100),
        license: license(source.license),
      };
    unique.set(JSON.stringify(item), item);
  }
  if (unique.size > 20) fail("Use at most 20 creator attribution records.");
  return [...unique.values()];
}
function publicFields(input: unknown, owner: string): PublicCreatorProgram {
  const source = record(input),
    sport = source.sport as TrainingSport,
    level = source.level as CreatorLevel;
  if (!trainingSports.includes(sport))
    fail("Choose running, riding, walking or hiking.");
  if (!["beginner", "intermediate", "advanced", "all"].includes(level))
    fail("Choose a valid program level.");
  const weeks = integer(
      source.weeks,
      "Program weeks",
      1,
      CREATOR_PROGRAM_LIMITS.maxWeeks,
    ),
    revision = integer(
      source.revision,
      "Program revision",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    updatedAt = timestamp(source.updatedAt);
  const creatorName = text(source.creatorName, "Creator name", 80),
    title = text(source.title, "Program title", 100),
    description = text(source.description, "Program description", 2000, true),
    programLicense = license(source.license);
  if (
    !Array.isArray(source.sessions) ||
    source.sessions.length > CREATOR_PROGRAM_LIMITS.maxSessions
  )
    fail("Use at most 100 sessions per program.");
  const seen = new Set<string>();
  const sessions = (source.sessions as unknown[]).map((value) => {
    const raw = record(value),
      id = identifier(raw.id, "session identifier");
    if (seen.has(id))
      fail("Every program session needs a different identifier.");
    seen.add(id);
    const sessionTitle = text(raw.title, "Session title", 100),
      week = integer(raw.week, "Session week", 1, weeks),
      day = integer(raw.day, "Session day", 1, 7),
      notes = text(raw.notes, "Session notes", 1000, true),
      work = record(raw.workout);
    const workout: CreatorWorkout = {
      warmupSec: work.warmupSec as number,
      workSec: work.workSec as number,
      recoverySec: work.recoverySec as number,
      repeats: work.repeats as number,
      cooldownSec: work.cooldownSec as number,
    };
    validateTrainingPlan({
      ...workout,
      id,
      ownerId: owner,
      title: sessionTitle,
      sport,
      updatedAt,
    });
    return { id, week, day, title: sessionTitle, notes, workout };
  });
  return {
    creatorName,
    title,
    description,
    sport,
    level,
    weeks,
    revision,
    updatedAt,
    license: programLicense,
    sessions,
    ...(source.attribution === undefined
      ? {}
      : { attribution: attributions(source.attribution) }),
  };
}
export function validateCreatorProgram(
  program: CreatorProgram,
): CreatorProgram {
  const raw = record(program),
    owner = validateCreatorOwner(raw.ownerId),
    id = identifier(raw.id, "program identifier");
  const { attribution: _publicAttribution, ...fields } = publicFields(
    raw,
    owner,
  );
  const result: CreatorProgram = { id, ownerId: owner, ...fields };
  if (raw.origin !== undefined) {
    const origin = record(raw.origin);
    result.origin = {
      creatorName: text(origin.creatorName, "Original creator name", 80),
      title: text(origin.title, "Original program title", 100),
      revision: integer(
        origin.revision,
        "Original revision",
        1,
        Number.MAX_SAFE_INTEGER,
      ),
      license: license(origin.license),
      importedAt: timestamp(origin.importedAt),
      ...(origin.attribution === undefined
        ? {}
        : { attribution: attributions(origin.attribution) }),
    };
  }
  return result;
}
export function validatePublicCreatorProgram(
  program: PublicCreatorProgram,
): PublicCreatorProgram {
  return publicFields(program, "import-preview");
}
function bytes(textValue: string) {
  let size = 0;
  for (const character of textValue) {
    const point = character.codePointAt(0)!;
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (size > CREATOR_PROGRAM_LIMITS.maxImportBytes) return size;
  }
  return size;
}
export function encodeCreatorProgram(program: CreatorProgram): string {
  const checked = validateCreatorProgram(program),
    { id: _id, ownerId: _owner, origin: _origin, ...safe } = checked;
  // Export identifiers describe public session slots, never local account/workout IDs.
  safe.sessions = safe.sessions.map((session, index) => ({
    ...session,
    id: `session-${index + 1}`,
  }));
  const attribution = attributions([
    {
      creatorName: checked.creatorName,
      title: checked.title,
      license: checked.license,
    },
    ...(checked.origin?.attribution ?? []),
    ...(checked.origin
      ? [
          {
            creatorName: checked.origin.creatorName,
            title: checked.origin.title,
            license: checked.origin.license,
          },
        ]
      : []),
  ]);
  const encoded = JSON.stringify(
    { schema: "rivl-training-program", version: 1, attribution, program: safe },
    null,
    2,
  );
  if (bytes(encoded) > CREATOR_PROGRAM_LIMITS.maxImportBytes)
    fail(
      "This program is too large to share. Shorten descriptions or session notes.",
    );
  return encoded;
}
export function decodeCreatorProgram(json: string): PublicCreatorProgram {
  if (
    typeof json !== "string" ||
    json.length > CREATOR_PROGRAM_LIMITS.maxImportBytes ||
    bytes(json) > CREATOR_PROGRAM_LIMITS.maxImportBytes
  )
    fail("Choose a training-program JSON file up to 200 KB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail("This training-program JSON could not be read.");
  }
  const packet = record(parsed);
  if (packet.schema !== "rivl-training-program" || packet.version !== 1)
    fail("Choose a supported RIVL training-program file (version 1).");
  const preview = publicFields(packet.program, "import-preview");
  const metadata =
    packet.attribution === undefined ? [] : attributions(packet.attribution);
  return {
    ...preview,
    attribution: attributions([...metadata, ...(preview.attribution ?? [])]),
  };
}
export function creatorSessionPlan(
  program: CreatorProgram,
  sessionId: string,
  ownerId: string,
  planId: string,
  now = Date.now(),
): TrainingPlan {
  const checked = validateCreatorProgram(program);
  validateCreatorOwner(ownerId);
  identifier(planId, "interval plan identifier");
  const session = checked.sessions.find((s) => s.id === sessionId);
  if (!session) fail("Choose a session from this program.");
  return validateTrainingPlan({
    ...session!.workout,
    id: planId,
    ownerId,
    title: session!.title,
    sport: checked.sport,
    updatedAt: now,
  });
}

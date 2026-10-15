import { supabase } from "./supabase";
import { backendConfigured } from "./config";
import { AppFailure } from "../security/errors";
import {
  validateCreatorProgram,
  type CreatorProgram,
} from "../domain/creator-training";
export interface PublishedCreatorProgram {
  program: CreatorProgram;
}
export const creatorTrainingCloudConfigured =
  backendConfigured && supabase !== null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limit = 200000;
function bytes(value: string) {
  let total = 0;
  for (const char of value) {
    const point = char.codePointAt(0)!;
    total += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
    if (total > limit) return total;
  }
  return total;
}
function publicPayload(program: CreatorProgram): CreatorProgram {
  const checked = validateCreatorProgram(program);
  if (checked.origin)
    throw new AppFailure(
      "validation",
      "Imported program copies cannot be published as your original work. Publish a program you authored.",
    );
  if (!uuid.test(checked.id) || !uuid.test(checked.ownerId))
    throw new AppFailure(
      "validation",
      "Cloud publication needs an account and valid program identity.",
    );
  if (!checked.sessions.length)
    throw new AppFailure(
      "validation",
      "Add a session before publishing this program.",
    );
  const safe: CreatorProgram = {
    id: checked.id,
    ownerId: checked.ownerId,
    creatorName: checked.creatorName,
    title: checked.title,
    description: checked.description,
    sport: checked.sport,
    level: checked.level,
    weeks: checked.weeks,
    revision: checked.revision,
    updatedAt: checked.updatedAt,
    license: checked.license,
    sessions: checked.sessions.map((s) => ({
      ...s,
      workout: { ...s.workout },
    })),
  };
  if (bytes(JSON.stringify(safe)) > limit)
    throw new AppFailure(
      "validation",
      "This program is too large to publish. Shorten descriptions or session notes.",
    );
  return safe;
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase || !backendConfigured)
    throw new AppFailure(
      "server",
      "Creator publishing needs a configured cloud connection. Your local draft is unchanged.",
    );
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response;
  try {
    response = await Promise.race([
      supabase.rpc(name, args).abortSignal(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new AppFailure(
              "timeout",
              "Creator sharing timed out. Refresh browse before retrying; your local draft is unchanged.",
              true,
            ),
          );
          controller.abort();
        }, 15000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const { data, error } = response;
  if (error) {
    if (error.code === "42501")
      throw new AppFailure(
        "forbidden",
        "This account cannot publish or change this program. Check the signed-in account.",
      );
    throw new AppFailure(
      "server",
      "Creator sharing could not finish. Check your connection and program revision, then try again. Your local draft is unchanged.",
    );
  }
  return data;
}
export async function listCreatorPrograms(
  sport?: CreatorProgram["sport"],
): Promise<PublishedCreatorProgram[]> {
  if (sport !== undefined && !["run", "ride", "walk", "hike"].includes(sport))
    throw new AppFailure("validation", "Choose a valid training sport.");
  return decodePublishedCreatorPrograms(
    await rpc("list_creator_programs", { p_sport: sport ?? null }),
  );
}
export function decodePublishedCreatorPrograms(
  data: unknown,
): PublishedCreatorProgram[] {
  if (!Array.isArray(data) || data.length > 20)
    throw new AppFailure(
      "server",
      "Creator programs could not be read completely.",
    );
  const seen = new Set<string>();
  try {
    return data.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw Error("Invalid row");
      const raw = (row as { program?: unknown }).program;
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        "origin" in raw
      )
        throw Error("Invalid program");
      const program = publicPayload(raw as CreatorProgram);
      if (seen.has(program.id)) throw Error("Duplicate program");
      seen.add(program.id);
      return { program };
    });
  } catch {
    throw new AppFailure(
      "server",
      "Creator programs could not be read completely.",
    );
  }
}
export async function publishCreatorProgram(
  program: CreatorProgram,
): Promise<void> {
  await rpc("publish_creator_program", { p_program: publicPayload(program) });
}
export async function unpublishCreatorProgram(id: string): Promise<void> {
  if (!uuid.test(id))
    throw new AppFailure("validation", "Choose a valid program identity.");
  await rpc("unpublish_creator_program", { p_id: id });
}

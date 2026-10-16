import { supabase } from "./supabase";
import { cloudAccessToken, assertCurrentCloudUser } from "./routes";
import { AppFailure } from "../security/errors";
export type ModerationRoles = { moderator: boolean; trackReviewer: boolean };
export type ModerationItem = {
  id: string;
  kind: "content" | "sharedRoute" | "creator";
  targetId: string;
  targetOwner: string | null;
  title: string;
  excerpt: string;
  reason: string;
  createdAt: string;
  version: string;
};
const invalid = () =>
  new AppFailure("server", "Review information could not be read.");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function decodeModerationQueue(data: unknown): ModerationItem[] {
  if (!Array.isArray(data) || data.length > 20) throw invalid();
  const seen = new Set<string>();
  return data.map((v) => {
    if (
      !v ||
      !uuid.test(v.id) ||
      !["content", "sharedRoute", "creator"].includes(v.kind) ||
      !uuid.test(v.targetId) ||
      (v.targetOwner !== null && !uuid.test(v.targetOwner)) ||
      typeof v.title !== "string" ||
      Array.from(v.title).length > 200 ||
      typeof v.excerpt !== "string" ||
      Array.from(v.excerpt).length > 500 ||
      typeof v.reason !== "string" ||
      v.reason.length > 100 ||
      typeof v.createdAt !== "string" ||
      !Number.isFinite(Date.parse(v.createdAt)) ||
      typeof v.version !== "string" ||
      !/^[a-f0-9]{32}$/.test(v.version) ||
      seen.has(`${v.kind}:${v.id}`)
    )
      throw invalid();
    seen.add(`${v.kind}:${v.id}`);
    return {
      id: v.id,
      kind: v.kind,
      targetId: v.targetId,
      targetOwner: v.targetOwner,
      title: v.title,
      excerpt: v.excerpt,
      reason: v.reason,
      createdAt: v.createdAt,
      version: v.version,
    };
  });
}
async function call(
  owner: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  const token = await cloudAccessToken(owner);
  if (!supabase) throw invalid();
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      supabase
        .rpc(name, args)
        .setHeader("Authorization", `Bearer ${token}`)
        .abortSignal(abort.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(
            new AppFailure("timeout", "Review timed out. Try again.", true),
          );
        }, 15000);
      }),
    ]);
    if (error)
      throw new AppFailure(
        error.code === "42501" ? "auth" : "server",
        error.code === "42501"
          ? "This account does not have review access."
          : error.code === "40001"
            ? "This review changed. Reload before deciding."
            : "Review could not be completed. Reload and try again.",
        true,
      );
    await assertCurrentCloudUser(owner);
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function moderationRoles(owner: string): Promise<ModerationRoles> {
  const data = await call(owner, "moderation_roles");
  if (
    !data ||
    typeof data.moderator !== "boolean" ||
    typeof data.trackReviewer !== "boolean"
  )
    throw invalid();
  return { moderator: data.moderator, trackReviewer: data.trackReviewer };
}
export async function moderationQueue(owner: string) {
  return decodeModerationQueue(await call(owner, "moderation_queue"));
}
export async function decideModeration(
  owner: string,
  item: ModerationItem,
  decision: "hide" | "dismiss",
  reason: string,
) {
  if (!reason.trim() || reason.length > 500)
    throw new AppFailure(
      "validation",
      "Enter a review reason up to 500 characters.",
    );
  await call(owner, "decide_moderation", {
    p_kind: item.kind,
    p_id: item.id,
    p_version: item.version,
    p_decision: decision,
    p_reason: reason.trim(),
  });
}
export async function reportCreatorProgram(
  owner: string,
  id: string,
  reason: "unsafe" | "privacy" | "spam" | "other",
) {
  await call(owner, "report_creator_program", { p_id: id, p_reason: reason });
}

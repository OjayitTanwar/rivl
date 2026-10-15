import type { Session, SocialPost } from "../domain/types";
import { AppFailure } from "../security/errors";
import { identifier } from "../security/validation";
import { assertCurrentCloudUser, cloudAccessToken } from "./routes";
import { supabase } from "./supabase";
export interface CommentCursor {
  id: string;
  createdAt: string;
}
export async function olderPostComments(
  session: Session,
  postId: string,
  cursor: CommentCursor,
) {
  if (session.local || !supabase)
    throw new AppFailure("offline", "Connect to load older comments.", true);
  identifier(postId, "Activity");
  identifier(cursor.id, "Comment");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      cursor.createdAt,
    ) ||
    !Number.isFinite(Date.parse(cursor.createdAt))
  )
    throw new AppFailure(
      "validation",
      "The comment page is invalid. Refresh the activity.",
    );
  const token = await cloudAccessToken(session.userId);
  const { data, error } = await supabase
    .from("comments")
    .select("id,body,created_at,athlete_id,profiles(name)")
    .eq("activity_id", postId)
    .or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20)
    .setHeader("Authorization", `Bearer ${token}`);
  if (error) throw error;
  await assertCurrentCloudUser(session.userId);
  const rows = data ?? [];
  const last = rows.at(-1);
  const comments: SocialPost["comments"] = rows
    .filter((row) => row.profiles)
    .map((row) => ({
      id: row.id,
      author: (row.profiles as unknown as { name: string }).name,
      authorId: row.athlete_id,
      text: row.body,
      at: Date.parse(row.created_at),
      createdAt: row.created_at,
    }))
    .reverse();
  return {
    comments,
    cursor: last ? { id: last.id, createdAt: last.created_at } : null,
    more: rows.length === 20,
  };
}

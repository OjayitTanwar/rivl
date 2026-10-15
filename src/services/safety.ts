import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";
import { database } from "../storage/database";
import type { Session, SocialPost } from "../domain/types";
import { AppFailure } from "../security/errors";
import { identifier, textInput } from "../security/validation";
export const reportReasons = ["harassment", "hate", "sexual", "violence", "spam", "privacy", "other"] as const;
export type ReportReason = typeof reportReasons[number];
export async function blockedAthletes(session: Session): Promise<string[]> {
  if (session.local) return await database.get<string[]>("blocks:" + session.userId) ?? [];
  if (!supabase) throw new AppFailure("offline", "Connect to manage blocked athletes.", true);
  const {data,error} = await supabase.from("athlete_blocks").select("blocked_id").eq("blocker_id",session.userId);
  if(error) throw error;
  return (data ?? []).map(row=>row.blocked_id);
}
export async function setBlocked(session: Session, athlete: string, blocked: boolean) {
  if (athlete === session.userId) throw new AppFailure("validation", "You cannot block your own account.");
  if (!session.local) {
    identifier(athlete,"Athlete");
    if (!supabase) throw new AppFailure("offline", "Reconnect to block this athlete.", true);
    const result = blocked ? await supabase.from("athlete_blocks").upsert({blocker_id:session.userId,blocked_id:athlete})
      : await supabase.from("athlete_blocks").delete().eq("blocker_id",session.userId).eq("blocked_id",athlete);
    if(result.error) throw result.error;
  }
  const ids = new Set(await database.get<string[]>("blocks:" + session.userId) ?? []);
  if(blocked) ids.add(athlete); else ids.delete(athlete);
  await database.set("blocks:" + session.userId,[...ids]);
  if(blocked) for(const post of await database.list<SocialPost>("post:" + session.userId + ":")) {
    if(post.activity.ownerId === athlete) await database.remove("post:" + session.userId + ":" + post.id);
    else await database.set("post:" + session.userId + ":" + post.id, {...post,comments:post.comments.filter(c=>c.authorId!==athlete),reactions:post.reactions.filter(id=>id!==athlete)});
  }
}
export async function reportContent(session: Session, kind: "activity" | "comment", target: string, reason: ReportReason, details: string) {
  details = textInput(details,"Report details",2000,false);
  if(!reportReasons.includes(reason)) throw new AppFailure("validation","Choose a report reason.");
  const id = Crypto.randomUUID();
  if(session.local) {
    await database.set("report:"+session.userId+":"+id,{id,kind,target,reason,details,at:Date.now()});
    return;
  }
  identifier(target,"Content ID");
  if(!supabase) throw new AppFailure("offline","Reconnect to submit this report.",true);
  const {error} = await supabase.rpc("report_content",{p_id:id,p_kind:kind,p_target:target,p_reason:reason,p_details:details});
  if(error) throw error;
}

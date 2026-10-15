import { assertCurrentCloudUser, cloudAccessToken } from "./routes";
import { identifier, textInput } from "../security/validation";
import { blockedAthletes } from "./safety";
import { AppFailure } from "../security/errors";
import { supabase } from "./supabase";
import { database } from "../storage/database";
import type { Session } from "../domain/types";
export interface Person {
  id: string;
  name: string;
  handle: string;
  following: boolean;
  friendship?: "none" | "sent" | "received" | "accepted";
}
export interface Club {
  id: string;
  name: string;
  description: string;
  joined: boolean;
}
export async function people(session: Session, q = ""): Promise<Person[]> {
  if (session.local) {
    const seed = session.demo
      ? [
          { id: "alex", name: "Alex Rivera", handle: "alexruns" },
          { id: "jun", name: "Jun Park", handle: "jun.outside" },
          { id: "sam", name: "Sam Ellis", handle: "sammiles" },
        ]
      : [];
    const followed =
      (await database.get<string[]>("following:" + session.userId)) ?? [];
    const blocked = await blockedAthletes(session);
    return seed
      .filter((p) => !blocked.includes(p.id))
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      .map((p) => ({ ...p, following: followed.includes(p.id) }));
  }
  q = textInput(q, "Search", 100, false);
  if (!supabase)
    throw new AppFailure("offline", "Community is not configured.", true);
  const token = await cloudAccessToken(session.userId);
  const p = await supabase
    .from("profiles")
    .select("id,name,handle")
    .neq("id", session.userId)
    .ilike("name", "%" + q.replace(/[%_\\]/g, "") + "%")
    .order("id")
    .limit(30)
    .setHeader("Authorization", `Bearer ${token}`);
  if (p.error) throw p.error;
  await assertCurrentCloudUser(session.userId);
  if (!p.data?.length) return [];
  const ids = p.data.map((person) => person.id);
  const links = await Promise.all([
    supabase
      .from("friendships")
      .select("requester_id,recipient_id,status")
      .eq("requester_id", session.userId)
      .in("recipient_id", ids)
      .limit(30)
      .setHeader("Authorization", `Bearer ${token}`),
    supabase
      .from("friendships")
      .select("requester_id,recipient_id,status")
      .eq("recipient_id", session.userId)
      .in("requester_id", ids)
      .limit(30)
      .setHeader("Authorization", `Bearer ${token}`),
  ]);
  for (const result of links) if (result.error) throw result.error;
  await assertCurrentCloudUser(session.userId);
  const friendships = links.flatMap((result) => result.data ?? []);
  return p.data.map((p) => {
    const matches = friendships.filter(
      (f) => f.requester_id === p.id || f.recipient_id === p.id,
    );
    const link =
      matches.find((f) => f.status === "accepted") ??
      matches.find((f) => f.recipient_id === session.userId) ??
      matches[0];
    return {
      ...p,
      following: !!link,
      friendship: !link
        ? "none"
        : link.status === "accepted"
          ? "accepted"
          : link.recipient_id === session.userId
            ? "received"
            : "sent",
    };
  });
}
export async function follow(session: Session, person: Person) {
  if (session.local) {
    const list =
      (await database.get<string[]>("following:" + session.userId)) ?? [];
    await database.set(
      "following:" + session.userId,
      person.following
        ? list.filter((x) => x !== person.id)
        : [...list, person.id],
    );
    return;
  }
  if (!supabase)
    throw new AppFailure("validation", "Community is not configured.");
  identifier(person.id, "Athlete");
  const token = await cloudAccessToken(session.userId);
  if (person.friendship === "received") {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("requester_id", person.id)
      .eq("recipient_id", session.userId)
      .setHeader("Authorization", `Bearer ${token}`);
    if (error) throw error;
    await assertCurrentCloudUser(session.userId);
    return;
  }
  const request = person.following
    ? supabase
        .from("friendships")
        .delete()
        .or(
          `and(requester_id.eq.${session.userId},recipient_id.eq.${person.id}),and(requester_id.eq.${person.id},recipient_id.eq.${session.userId})`,
        )
    : supabase.from("friendships").insert({
        requester_id: session.userId,
        recipient_id: person.id,
        status: "pending",
      });
  const { error } = await request.setHeader("Authorization", `Bearer ${token}`);
  if (error) throw error;
  await assertCurrentCloudUser(session.userId);
}
export async function clubs(session: Session): Promise<Club[]> {
  if (session.local) {
    const joined =
      (await database.get<string[]>("clubs:" + session.userId)) ?? [];
    return (
      session.demo
        ? [
            {
              id: "sunrise",
              name: "The Before Work Club",
              description: "Easy miles. Good coffee. All paces welcome.",
            },
            {
              id: "weekenders",
              name: "Long Way Home",
              description: "Weekend routes, new perspectives.",
            },
          ]
        : []
    ).map((c) => ({ ...c, joined: joined.includes(c.id) }));
  }
  if (!supabase)
    throw new AppFailure("offline", "Community is not configured.", true);
  const token = await cloudAccessToken(session.userId);
  const c = await supabase
    .from("clubs")
    .select("id,name,description")
    .order("name")
    .order("id")
    .limit(100)
    .setHeader("Authorization", `Bearer ${token}`);
  if (c.error) throw c.error;
  await assertCurrentCloudUser(session.userId);
  if (!c.data?.length) return [];
  const m = await supabase
    .from("club_members")
    .select("club_id")
    .eq("athlete_id", session.userId)
    .in(
      "club_id",
      c.data.map((club) => club.id),
    )
    .limit(100)
    .setHeader("Authorization", `Bearer ${token}`);
  if (m.error) throw m.error;
  await assertCurrentCloudUser(session.userId);
  return c.data.map((c) => ({
    ...c,
    joined: (m.data ?? []).some((m) => m.club_id === c.id),
  }));
}
export async function joinClub(session: Session, club: Club) {
  if (session.local) {
    const list =
      (await database.get<string[]>("clubs:" + session.userId)) ?? [];
    await database.set(
      "clubs:" + session.userId,
      club.joined ? list.filter((x) => x !== club.id) : [...list, club.id],
    );
    return;
  }
  if (!supabase)
    throw new AppFailure("validation", "Community is not configured.");
  identifier(club.id, "Club");
  const token = await cloudAccessToken(session.userId);
  const request = club.joined
    ? supabase
        .from("club_members")
        .delete()
        .eq("club_id", club.id)
        .eq("athlete_id", session.userId)
    : supabase
        .from("club_members")
        .insert({ club_id: club.id, athlete_id: session.userId });
  const { error } = await request.setHeader("Authorization", `Bearer ${token}`);
  if (error) throw error;
  await assertCurrentCloudUser(session.userId);
}

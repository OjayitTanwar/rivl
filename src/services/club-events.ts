import { supabase } from "./supabase";
import { cloudAccessToken, assertCurrentCloudUser } from "./routes";
import { AppFailure } from "../security/errors";
import { identifier, textInput } from "../security/validation";
import {
  decodeClubDetail,
  clubEventInput,
  type ClubRole,
} from "../domain/club-events";
async function call(
  owner: string,
  name: string,
  args: Record<string, unknown>,
) {
  const token = await cloudAccessToken(owner);
  await assertCurrentCloudUser(owner);
  if (!supabase)
    throw new AppFailure("offline", "Connect to club events.", true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
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
            new AppFailure(
              "timeout",
              "Club request timed out. Refresh before retrying.",
              true,
            ),
          );
        }, 12000);
      }),
    ]);
    if (error)
      throw new AppFailure(
        "server",
        error.code === "42501"
          ? "Club access changed. Refresh and try again."
          : error.message?.includes("full")
            ? "This event is full."
            : error.message?.includes("Transfer ownership")
              ? "Transfer ownership before leaving."
              : error.message?.includes("no longer accepting")
                ? "This event is no longer accepting responses."
                : "Club request could not complete. Check the details and refresh.",
        true,
      );
    await assertCurrentCloudUser(owner);
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function clubDetail(owner: string, club: string) {
  identifier(club, "Club");
  return decodeClubDetail(await call(owner, "club_detail", { p_club: club }));
}
export async function createClub(
  owner: string,
  name: string,
  description: string,
) {
  const data = await call(owner, "create_club", {
    p_name: textInput(name, "Club name", 80, true),
    p_description: textInput(description, "Description", 500, false),
  });
  identifier(data, "Club");
  return data as string;
}
export async function setClubMembership(
  owner: string,
  club: string,
  join: boolean,
) {
  identifier(club, "Club");
  await call(owner, "set_club_membership", { p_club: club, p_join: join });
}
export async function setClubRole(
  owner: string,
  club: string,
  athlete: string,
  role: Exclude<ClubRole, "visitor">,
) {
  identifier(club, "Club");
  identifier(athlete, "Athlete");
  await call(owner, "set_club_role", {
    p_club: club,
    p_athlete: athlete,
    p_role: role,
  });
}
export async function createClubEvent(
  owner: string,
  club: string,
  input: Parameters<typeof clubEventInput>[0],
) {
  identifier(club, "Club");
  await call(owner, "create_club_event", {
    p_club: club,
    ...clubEventInput(input),
  });
}
export async function clubRsvp(
  owner: string,
  event: string,
  attending: boolean,
) {
  identifier(event, "Event");
  await call(owner, "club_event_rsvp", {
    p_event: event,
    p_attending: attending,
  });
}
export async function cancelClubEvent(owner: string, event: string) {
  identifier(event, "Event");
  await call(owner, "cancel_club_event", { p_event: event });
}

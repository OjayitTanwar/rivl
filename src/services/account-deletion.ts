import { supabase } from "./supabase";
import { AppFailure } from "../security/errors";
import { identifier, passwordInput } from "../security/validation";
import type { Session } from "../domain/types";
export async function deletionPending(session: Session): Promise<boolean> {
  if (session.local || !supabase) return false;
  const { data, error } = await supabase
    .from("account_deletions")
    .select("state")
    .eq("owner_id", session.userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
export async function clearCloudSession(session: Session): Promise<void> {
  if (session.local || !supabase) return;
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}
async function requireActiveOwner(session: Session): Promise<void> {
  const { data, error } = await supabase!.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== session.userId)
    throw new AppFailure("forbidden", "Sign in to the account being deleted.");
}
async function submitDeletion(
  session: Session,
): Promise<"completed" | "requested"> {
  // Recheck after reauthentication: a different sign-in must never turn a
  // pending confirmation for one athlete into deletion of another athlete.
  await requireActiveOwner(session);
  const { data, error } = await supabase!.functions.invoke("delete-account", {
    body: {},
  });
  if (error) {
    const status = await supabase!
      .from("account_deletions")
      .select("state")
      .eq("owner_id", session.userId)
      .maybeSingle();
    if (!status.error && status.data)
      return status.data.state === "completed" ? "completed" : "requested";
    throw new AppFailure(
      "server",
      "Deletion could not be confirmed. Retry to check the request. No confirmation is shown until the server accepts it.",
      true,
    );
  }
  if (
    data?.accepted !== true ||
    !["completed", "requested"].includes(data.state)
  )
    throw new AppFailure(
      "server",
      "The deletion service returned an unexpected response. Retry to check the request.",
      true,
    );
  return data.state;
}
function requireClient(session: Session) {
  if (session.local) return null;
  if (!supabase)
    throw new AppFailure(
      "server",
      "Account deletion is unavailable. Reconnect and retry.",
      true,
    );
  return supabase;
}
async function existingRequest(
  session: Session,
): Promise<"completed" | "requested" | null> {
  const pending = await supabase!
    .from("account_deletions")
    .select("state")
    .eq("owner_id", session.userId)
    .maybeSingle();
  if (!pending.error && pending.data)
    return pending.data.state === "completed" ? "completed" : "requested";
  return null;
}
export async function requestDeletion(
  session: Session,
  password: string,
): Promise<"completed" | "requested"> {
  if (!requireClient(session)) return "completed";
  await requireActiveOwner(session);
  const existing = await existingRequest(session);
  if (existing) return existing;
  const auth = await supabase!.auth.signInWithPassword({
    email: session.email,
    password: passwordInput(password, false),
  });
  if (auth.error) throw auth.error;
  if (auth.data.user.id !== session.userId)
    throw new AppFailure("forbidden", "Sign in to the account being deleted.");
  return submitDeletion(session);
}
// Password reauthentication cannot work for accounts created through Apple or
// Google without ever setting a password; offer a fresh one-time email code.
export async function sendDeletionCode(session: Session): Promise<void> {
  if (!requireClient(session)) return;
  await requireActiveOwner(session);
  const existing = await existingRequest(session);
  if (existing) return;
  const { error } = await supabase!.auth.signInWithOtp({
    email: session.email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}
// True when the account has a password identity, so password reauthentication
// is possible; otherwise the deletion screen must offer the email code.
export async function passwordDeletionAvailable(
  session: Session,
): Promise<boolean> {
  if (session.local || !supabase) return false;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== session.userId)
    throw new AppFailure("forbidden", "Sign in to the account being deleted.");
  const providers = data.session?.user?.identities;
  if (!Array.isArray(providers)) return true;
  return providers.some((identity) => identity?.provider === "email");
}
export async function requestDeletionWithCode(
  session: Session,
  code: string,
): Promise<"completed" | "requested"> {
  if (!requireClient(session)) return "completed";
  // The email OTP length is a hosted Auth setting (6–10 digits), so accept the
  // configured range and let the server reject a wrong code.
  if (typeof code !== "string" || !/^\d{6,10}$/.test(code))
    throw new AppFailure("validation", "Enter the code from the email.");
  await requireActiveOwner(session);
  const existing = await existingRequest(session);
  if (existing) return existing;
  const auth = await supabase!.auth.verifyOtp({
    email: session.email,
    token: code,
    type: "email",
  });
  if (auth.error) throw auth.error;
  identifier(auth.data.user?.id, "Account");
  if (auth.data.user?.id !== session.userId)
    throw new AppFailure("forbidden", "Confirm the account being deleted.");
  return submitDeletion(session);
}

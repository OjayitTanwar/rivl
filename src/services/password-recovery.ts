import { supabase, configurationError } from "./supabase";
import { AppFailure } from "../security/errors";
import { emailInput, passwordInput } from "../security/validation";
import type { User } from "@supabase/supabase-js";

// Password recovery shares the PKCE code flow used for sign-up confirmation
// and OAuth, but returns to its own deep link so the app can tell a recovery
// code apart from a provider sign-in code.
export const recoveryRedirect = "rivl://password-reset";

function requireSupabase() {
  if (configurationError) throw configurationError;
  if (!supabase)
    throw new AppFailure(
      "auth",
      "Cloud sign-in is unavailable. You can create a device account now.",
    );
  return supabase;
}

export async function beginPasswordRecovery(email: string): Promise<void> {
  const client = requireSupabase();
  const address = emailInput(email);
  const { error } = await client.auth.resetPasswordForEmail(address, {
    redirectTo: recoveryRedirect,
  });
  if (error) throw error;
}

export async function finishPasswordRecovery(
  code: string,
  password: string,
): Promise<User> {
  const client = requireSupabase();
  if (typeof code !== "string" || !code || code.length > 2048)
    throw new AppFailure(
      "auth",
      "This password-reset link is incomplete. Request a fresh email.",
    );
  const newPassword = passwordInput(password, true);
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  if (!data.user)
    throw new AppFailure(
      "auth",
      "The password-reset link has expired. Request a fresh email.",
    );
  // Change the password while the session just exchanged from the email is
  // still the active one, before any other work can replace it.
  const { error: updateError } = await client.auth.updateUser({
    password: newPassword,
  });
  if (updateError) throw updateError;
  return data.user;
}

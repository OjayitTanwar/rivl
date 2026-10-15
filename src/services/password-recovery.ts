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

// A PKCE code is single-use. Keep only the most recent exchanged attempt in
// memory so a transient password-save failure can be retried without trying
// to consume that code again. Never persist recovery codes or passwords.
let recoveryAttempt: {
  code: string;
  user: Promise<User>;
  expiresAt: number;
} | null = null;
let saving = false;

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
  if (saving)
    throw new AppFailure(
      "auth",
      "A password change is already in progress. Please wait.",
    );
  saving = true;
  try {
    if (
      !recoveryAttempt ||
      recoveryAttempt.code !== code ||
      recoveryAttempt.expiresAt <= Date.now()
    ) {
      const user = client.auth
        .exchangeCodeForSession(code)
        .then(({ data, error }) => {
          if (error) throw error;
          if (!data.user)
            throw new AppFailure(
              "auth",
              "The password-reset link has expired. Request a fresh email.",
            );
          return data.user;
        });
      recoveryAttempt = { code, user, expiresAt: Date.now() + 15 * 60_000 };
    }
    const attempt = recoveryAttempt;
    let user: User;
    try {
      user = await attempt.user;
    } catch (error) {
      if (recoveryAttempt === attempt) recoveryAttempt = null;
      throw error;
    }
    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    if (current.data.session?.user.id !== user.id) {
      recoveryAttempt = null;
      throw new AppFailure(
        "auth",
        "The signed-in account changed. Request a fresh password-reset email.",
      );
    }
    const { error: updateError } = await client.auth.updateUser({
      password: newPassword,
    });
    if (updateError) throw updateError;
    recoveryAttempt = null;
    return user;
  } finally {
    saving = false;
  }
}

import { supabase } from "./supabase";
import { emailInput } from "../security/validation";
import { AppFailure } from "../security/errors";

export async function resendSignupConfirmation(email: string): Promise<void> {
  const address = emailInput(email);
  if (!supabase)
    throw new AppFailure("auth", "Cloud accounts are not connected yet.");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: address,
    options: { emailRedirectTo: "rivl://auth-callback" },
  });
  if (error) throw error;
}

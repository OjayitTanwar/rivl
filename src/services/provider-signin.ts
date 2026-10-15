import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";
import { AppFailure } from "../security/errors";
import { oauthCode } from "../domain/oauth-callback";
import type { User } from "@supabase/supabase-js";
WebBrowser.maybeCompleteAuthSession();
export type SignInProvider = "google" | "apple";
const exchanges = new Map<string, Promise<User>>();
export function finishProviderSignIn(code: string): Promise<User> {
  if (!supabase)
    return Promise.reject(
      new AppFailure(
        "auth",
        "Cloud sign-in hasn’t been connected for this build.",
      ),
    );
  if (!code || code.length > 2048)
    return Promise.reject(
      new AppFailure("auth", "Start sign-in again to get a fresh link."),
    );
  const old = exchanges.get(code);
  if (old) return currentExchangeUser(old);
  const work = supabase.auth
    .exchangeCodeForSession(code)
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data.user)
        throw new AppFailure("auth", "Sign-in returned no account. Try again.");
      return data.user;
    });
  exchanges.set(code, work);
  void work.catch(() => exchanges.delete(code));
  while (exchanges.size > 8) exchanges.delete(exchanges.keys().next().value!);
  return currentExchangeUser(work);
}
async function currentExchangeUser(work: Promise<User>): Promise<User> {
  const user = await work;
  // A completed code can be delivered twice by the browser and the deep link.
  // Its cached result is valid only while that account still owns the session.
  const { data, error } = await supabase!.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== user.id)
    throw new AppFailure(
      "auth",
      "This sign-in link has expired. Start sign-in again.",
    );
  return user;
}
export async function beginProviderSignIn(
  provider: SignInProvider,
): Promise<User | null> {
  if (!supabase)
    throw new AppFailure(
      "auth",
      "Google and Apple sign-in need RIVL’s cloud connection. You can create a device account now.",
    );
  const redirectTo = "rivl://auth-callback";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url)
    throw new AppFailure("auth", "The provider couldn’t open sign-in.");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return null;
  return finishProviderSignIn(oauthCode(result.url));
}

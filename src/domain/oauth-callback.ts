import { AppFailure } from "../security/errors";
export function oauthCode(url: string): string {
  const callback = new URL(url);
  if (callback.protocol !== "rivl:" || callback.hostname !== "auth-callback")
    throw new AppFailure("auth", "The sign-in return address is invalid.");
  if (callback.searchParams.has("error"))
    throw new AppFailure(
      "auth",
      "The sign-in provider declined the request. Try again.",
    );
  const code = callback.searchParams.get("code");
  if (!code || code.length > 2048)
    throw new AppFailure(
      "auth",
      "The sign-in link is incomplete. Start sign-in again.",
    );
  return code;
}

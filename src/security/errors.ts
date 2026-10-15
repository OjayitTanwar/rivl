export type FailureKind =
  | "validation"
  | "offline"
  | "timeout"
  | "cancelled"
  | "auth"
  | "forbidden"
  | "rate_limit"
  | "storage"
  | "server"
  | "unknown";
export class AppFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AppFailure";
  }
}
export function failure(error: unknown): AppFailure {
  if (error instanceof AppFailure) return error;
  const e =
    typeof error === "object" && error !== null
      ? (error as {
          name?: string;
          code?: string;
          status?: number;
          message?: string;
        })
      : {};
  if (e.name === "AbortError")
    return new AppFailure("cancelled", "The request was cancelled.");
  if (
    e.status === 401 ||
    ["refresh_token_not_found", "refresh_token_already_used"].includes(
      e.code ?? "",
    )
  )
    return new AppFailure(
      "auth",
      "Your session has ended. Sign in again. Your saved workouts are still on this device.",
    );
  if (e.status === 403 || e.code === "42501")
    return new AppFailure("forbidden", "You don’t have permission to do that.");
  if (e.status === 429)
    return new AppFailure(
      "rate_limit",
      "Too many requests. Wait a moment and try again.",
      true,
    );
  if (e.status && e.status >= 500)
    return new AppFailure(
      "server",
      "RIVL couldn’t reach the service. Your saved workouts are safe. Try again shortly.",
      true,
    );
  if (/network|failed to fetch|fetch failed/i.test(e.message ?? ""))
    return new AppFailure(
      "offline",
      "Connection unavailable. Your saved workouts are still here. Reconnect and retry.",
      true,
    );
  if (/SQLITE_FULL|disk is full|no space left/i.test(e.message ?? ""))
    return new AppFailure(
      "storage",
      "Your device is out of storage. Free some space, then retry. Existing workouts have not been deleted.",
    );
  if (/SQLITE|database|keychain|keystore/i.test(e.message ?? ""))
    return new AppFailure(
      "storage",
      "RIVL couldn’t open its protected data. Unlock your device and retry.",
      true,
    );
  if (e.code === "invalid_credentials")
    return new AppFailure(
      "auth",
      "Email or password didn’t match. Check them and try again.",
    );
  return new AppFailure(
    "unknown",
    "Something went wrong. Try again; your saved workouts have not been deleted.",
    true,
  );
}
export function userMessage(error: unknown): string {
  return failure(error).message;
}

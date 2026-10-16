import { supabase } from "./supabase";
import { cloudAccessToken, assertCurrentCloudUser } from "./routes";
import { decodeSharedRoute, type SharedRoute } from "../domain/shared-routes";
import type { Sport } from "../domain/types";
import { AppFailure } from "../security/errors";
async function call(
  owner: string,
  name: string,
  args: Record<string, unknown>,
) {
  const token = await cloudAccessToken(owner);
  if (!supabase)
    throw new AppFailure("offline", "Connect to shared routes.", true);
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
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
              "Shared routes timed out. Try again.",
              true,
            ),
          );
        }, 15000);
      }),
    ]);
    if (error)
      throw new AppFailure(
        "server",
        error.code === "42501"
          ? "This route is unavailable."
          : "Shared routes could not load. Check the route and try again.",
        true,
      );
    await assertCurrentCloudUser(owner);
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function listSharedRoutes(
  owner: string,
  sport?: Sport,
  before?: SharedRoute,
): Promise<SharedRoute[]> {
  const data = await call(owner, "list_shared_routes", {
    p_sport: sport ?? null,
    p_before: before?.publishedAt ?? null,
    p_before_id: before?.id ?? null,
  });
  if (!Array.isArray(data) || data.length > 20)
    throw new Error("Invalid shared route response.");
  return data.map(decodeSharedRoute);
}
export async function publishSharedRoute(owner: string, id: string) {
  await call(owner, "publish_shared_route", { p_id: id });
}
export async function unpublishSharedRoute(owner: string, id: string) {
  await call(owner, "unpublish_shared_route", { p_id: id });
}
export async function reportSharedRoute(
  owner: string,
  id: string,
  reason: "unsafe" | "privacy" | "spam" | "other",
) {
  await call(owner, "report_shared_route", { p_id: id, p_reason: reason });
}

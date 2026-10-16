import { supabase } from "./supabase";
import { cloudAccessToken, assertCurrentCloudUser } from "./routes";
import { AppFailure } from "../security/errors";
import {
  decodeLiveShare,
  validateLiveRecipients,
} from "../domain/live-sharing";
import { identifier } from "../security/validation";
async function call(
  owner: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  const token = await cloudAccessToken(owner);
  await assertCurrentCloudUser(owner);
  if (!supabase)
    throw new AppFailure("offline", "Connect to live sharing.", true);
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
              "Live sharing did not update. Try again.",
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
          ? "Sharing ended or access changed."
          : "Live sharing could not update. Check your connection.",
        true,
      );
    await assertCurrentCloudUser(owner);
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function liveShares(owner: string) {
  const data = await call(owner, "list_live_shares");
  if (!Array.isArray(data) || data.length > 101)
    throw new Error("Invalid live shares");
  return data.map(decodeLiveShare);
}
export async function liveFriends(
  owner: string,
): Promise<{ id: string; name: string }[]> {
  const data = await call(owner, "live_share_friends");
  if (!Array.isArray(data) || data.length > 100)
    throw new Error("Invalid friends");
  return data.map((v) => {
    identifier(v.id, "Friend");
    if (typeof v.name !== "string" || v.name.length > 180)
      throw new Error("Invalid friend");
    return { id: v.id, name: v.name };
  });
}
export async function startLiveShare(owner: string, recipients: string[]) {
  const data = await call(owner, "start_live_share", {
    p_recipients: validateLiveRecipients(recipients),
  });
  return decodeLiveShare({ ...data, name: "You" });
}
export async function stopLiveShare(owner: string, id: string) {
  identifier(id, "Share");
  await call(owner, "stop_live_share", { p_id: id });
}
export async function updateLiveShare(
  owner: string,
  id: string,
  point: { lat: number; lng: number; accuracy: number; t: number },
) {
  identifier(id, "Share");
  if (
    !Number.isFinite(point.lat) ||
    Math.abs(point.lat) > 90 ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lng) > 180 ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy < 0 ||
    point.accuracy > 100 ||
    !Number.isFinite(point.t) ||
    Math.abs(Date.now() - point.t) > 60000
  )
    return false;
  return (
    (await call(owner, "update_live_share", {
      p_id: id,
      p_lat: point.lat,
      p_lng: point.lng,
      p_accuracy: point.accuracy,
      p_sampled_at: new Date(point.t).toISOString(),
    })) === true
  );
}

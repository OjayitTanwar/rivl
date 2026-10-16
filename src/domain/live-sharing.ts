import { AppFailure } from "../security/errors";
export type LiveShare = {
  id: string;
  ownerId: string;
  name: string;
  expiresAt: number;
  startedAt: number;
  recipientCount: number;
  point: null | {
    lat: number;
    lng: number;
    accuracy: number;
    sampledAt: number;
    receivedAt: number;
  };
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function decodeLiveShare(value: unknown): LiveShare {
  const v = value as Record<string, unknown>;
  if (
    !v ||
    typeof v !== "object" ||
    typeof v.id !== "string" ||
    !uuid.test(v.id) ||
    typeof v.owner_id !== "string" ||
    !uuid.test(v.owner_id) ||
    typeof v.name !== "string" ||
    v.name.length > 180
  )
    throw new Error("Invalid live share");
  const startedAt = Date.parse(String(v.started_at)),
    expiresAt = Date.parse(String(v.expires_at));
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= startedAt ||
    expiresAt - startedAt > 3600001 ||
    !Number.isInteger(v.recipient_count) ||
    Number(v.recipient_count) < 0 ||
    Number(v.recipient_count) > 10
  )
    throw new Error("Invalid live share expiry");
  let point: LiveShare["point"] = null;
  if (v.lat !== null && v.lat !== undefined) {
    const sampledAt = Date.parse(String(v.sampled_at)),
      receivedAt = Date.parse(String(v.received_at));
    if (
      typeof v.lat !== "number" ||
      !Number.isFinite(v.lat) ||
      Math.abs(v.lat) > 90 ||
      typeof v.lng !== "number" ||
      !Number.isFinite(v.lng) ||
      Math.abs(v.lng) > 180 ||
      typeof v.accuracy !== "number" ||
      !Number.isFinite(v.accuracy) ||
      v.accuracy < 0 ||
      v.accuracy > 100 ||
      !Number.isFinite(sampledAt) ||
      !Number.isFinite(receivedAt)
    )
      throw new Error("Invalid live point");
    point = {
      lat: v.lat,
      lng: v.lng,
      accuracy: v.accuracy,
      sampledAt,
      receivedAt,
    };
  }
  return {
    id: v.id,
    ownerId: v.owner_id,
    name: v.name,
    startedAt,
    expiresAt,
    recipientCount: Number(v.recipient_count),
    point,
  };
}
export function livePointFresh(share: LiveShare, now = Date.now()) {
  return (
    share.expiresAt > now &&
    !!share.point &&
    now - share.point.sampledAt >= -10000 &&
    now - share.point.sampledAt <= 60000 &&
    now - share.point.receivedAt >= -10000 &&
    now - share.point.receivedAt <= 60000
  );
}
export function validateLiveRecipients(ids: string[]) {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 10 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string" || !uuid.test(id))
  )
    throw new AppFailure("validation", "Select up to ten accepted friends.");
  return ids;
}

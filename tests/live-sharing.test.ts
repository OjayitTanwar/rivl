import { describe, it, expect } from "vitest";
import {
  decodeLiveShare,
  livePointFresh,
  validateLiveRecipients,
} from "../src/domain/live-sharing";
const id = "90000000-0000-4000-8000-000000000001",
  other = "90000000-0000-4000-8000-000000000002";
const now = Date.now(),
  row = {
    id,
    owner_id: other,
    name: "Athlete",
    started_at: new Date(now).toISOString(),
    expires_at: new Date(now + 3600000).toISOString(),
    recipient_count: 1,
    lat: 10,
    lng: 20,
    accuracy: 12,
    sampled_at: new Date(now).toISOString(),
    received_at: new Date(now).toISOString(),
  };
describe("live sharing boundaries", () => {
  it("decodes latest point and detects stale or expired shares", () => {
    const share = decodeLiveShare(row);
    expect(livePointFresh(share, now)).toBe(true);
    expect(livePointFresh(share, now + 61000)).toBe(false);
    expect(livePointFresh(share, now + 3600000)).toBe(false);
  });
  it("keeps no-fix sessions distinct from zero coordinates", () => {
    expect(decodeLiveShare({ ...row, lat: null, lng: null }).point).toBeNull();
    expect(decodeLiveShare({ ...row, lat: 0, lng: 0 }).point?.lat).toBe(0);
  });
  it("rejects oversized sessions, corrupt coordinates and bad accuracy", () => {
    expect(() =>
      decodeLiveShare({
        ...row,
        expires_at: new Date(now + 7200000).toISOString(),
      }),
    ).toThrow();
    expect(() => decodeLiveShare({ ...row, lat: NaN })).toThrow();
    expect(() => decodeLiveShare({ ...row, accuracy: 101 })).toThrow();
  });
  it("requires deliberately selected distinct UUID recipients within cap", () => {
    expect(validateLiveRecipients([id, other])).toEqual([id, other]);
    for (const ids of [[], [id, id], ["local-user"], Array(11).fill(id)])
      expect(() => validateLiveRecipients(ids)).toThrow();
  });
});

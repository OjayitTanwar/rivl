import { describe, it, expect, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/services/supabase", () => ({ supabase: { rpc } }));
import {
  communityTrackPort,
  decodeObservedTrackCells,
  nearbyObservedTracks,
} from "../src/services/community-track-sync";
const row = { lat: 0.001, lng: 0.005, expires_at: "2026-10-15T00:00:00Z" };
describe("bounded community read and sync adapter", () => {
  it("decodes broad observations without contributor counts, identities or timestamps", () => {
    expect(decodeObservedTrackCells([row], 0, 0)).toEqual([
      {
        lat: 0.001,
        lng: 0.005,
        evidence: "gps_observed_use",
        status: "corroborated",
        expiresAt: row.expires_at,
      },
    ]);
  });
  it("rejects malformed, remote or duplicate cells and overlarge responses", () => {
    for (const payload of [
      null,
      [{ ...row, lat: NaN }],
      [{ ...row, lat: 30 }],
      [{ ...row, expires_at: "bad" }],
      [row, row],
      Array(201).fill(row),
    ])
      expect(() => decodeObservedTrackCells(payload, 0, 0)).toThrow();
  });
  it("refuses invalid map centers before network access", async () => {
    rpc.mockReset();
    expect(await nearbyObservedTracks(NaN, 0)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("validates remote preference shape and preserves a disabled preference", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ enabled: false, revision: 4 }],
      error: null,
    });
    expect(await communityTrackPort.preference()).toEqual({
      enabled: false,
      revision: 4,
    });
    rpc.mockResolvedValueOnce({
      data: [{ enabled: "true", revision: 4 }],
      error: null,
    });
    await expect(communityTrackPort.preference()).rejects.toThrow();
  });
  it("uploads references only and surfaces safe errors without exposing server details", async () => {
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ error: null, data: null });
    await communityTrackPort.submit("id", 3, "watch-gps", 4);
    expect(rpc).toHaveBeenCalledWith("submit_track_contribution", {
      p_activity_id: "id",
      p_revision: 3,
      p_origin: "watch-gps",
      p_preference_revision: 4,
    });
    rpc.mockResolvedValueOnce({
      error: { message: "private coordinate" },
      data: null,
    });
    await expect(communityTrackPort.deleteAll()).rejects.toThrow(
      "Pending contributions",
    );
  });
});

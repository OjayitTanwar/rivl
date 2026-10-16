import { expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/services/supabase", () => ({ supabase: { rpc } }));
import {
  decodeReconstructedTracks,
  nearbyReconstructedTracks,
} from "../src/services/reconstructed-tracks";
const center = { lat: 0, lng: 0 };
const row = {
  way_id: 12,
  version: 3,
  start_fraction: 200,
  end_fraction: 210,
  points: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.0001 },
  ],
  tags: { highway: "cycleway", bicycle: "yes", foot: "no" },
  source: "OpenStreetMap",
  license: "ODbL-1.0",
  expires_at: "2099-01-01T00:00:00Z",
};
it("keeps observed section evidence separate from access, protection and routing", () => {
  const result = decodeReconstructedTracks([row], center)[0]!;
  expect(result).toMatchObject({
    startFraction: 200,
    endFraction: 210,
    evidence: "corroborated_observed_use",
    routingEligible: false,
  });
  expect(result.way).toMatchObject({
    wayId: 12,
    version: 3,
    kind: "cycleway",
    bicycleAccess: "mapped_allowed",
    footAccess: "mapped_restricted",
    motorProtection: "unknown",
  });
  expect(result.way.points).toEqual(row.points);
});
it("fails closed on malformed, oversized, remote, duplicate and incorrectly attributed output", () => {
  for (const input of [
    null,
    Array(201).fill(row),
    [row, row],
    [{ ...row, way_id: 1.5 }],
    [{ ...row, start_fraction: 211 }],
    [{ ...row, end_fraction: 1001 }],
    [{ ...row, source: "GPS" }],
    [{ ...row, license: "unknown" }],
    [{ ...row, points: [center, { lat: NaN, lng: 0 }] }],
    [{ ...row, points: [center, { lat: 1, lng: 1 }] }],
    [{ ...row, expires_at: "bad" }],
  ]) {
    expect(() => decodeReconstructedTracks(input, center)).toThrow(
      "could not be read",
    );
  }
});
it("omits expired geometry and strips contributor metadata", () => {
  expect(
    decodeReconstructedTracks(
      [{ ...row, expires_at: "2020-01-01T00:00:00Z" }],
      center,
    ),
  ).toEqual([]);
  const decoded = decodeReconstructedTracks(
    [
      {
        ...row,
        owner_id: "private",
        activity_id: "private",
        observed_day: "private",
      },
    ],
    center,
  )[0]!;
  expect(decoded).not.toHaveProperty("owner_id");
  expect(decoded).not.toHaveProperty("activity_id");
  expect(decoded).not.toHaveProperty("observed_day");
});
it("bounds centers before calling the server and keeps backend errors private", async () => {
  rpc.mockReset();
  await expect(
    nearbyReconstructedTracks({ lat: Infinity, lng: 0 }),
  ).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "private trace" },
  });
  await expect(nearbyReconstructedTracks(center)).rejects.toThrow(
    "discovery is unavailable",
  );
  rpc.mockResolvedValueOnce({ data: [row], error: null });
  expect(await nearbyReconstructedTracks(center)).toHaveLength(1);
  expect(rpc).toHaveBeenLastCalledWith("list_track_candidates", {
    p_lat: 0,
    p_lng: 0,
  });
});

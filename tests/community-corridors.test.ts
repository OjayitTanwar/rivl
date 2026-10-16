import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/supabase", () => ({ supabase: null }));
vi.mock("../src/services/routes", () => ({
  cloudAccessToken: vi.fn(),
  assertCurrentCloudUser: vi.fn(),
}));
import { decodeCommunityCorridors } from "../src/services/community-corridors";
const now = Date.parse("2026-10-16T12:00:00Z");
const center = { lat: 0, lng: 0 };
const id = (n: number) =>
  `ab000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function row(n = 1, count = 11) {
  return {
    id: id(n),
    revision: 1,
    sport: "run",
    width_meters: 2,
    points: Array.from({ length: count }, (_, i) => ({
      lat: 0,
      lng: i * 0.00001,
    })),
    expires_at: "2026-10-17T12:00:00Z",
    state: "proposed",
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());
describe("community corridor response validation", () => {
  it("preserves geometry exactly, strips private metadata and always disables routing", () => {
    const source = {
      ...row(),
      points: row().points.map((p) => ({
        ...p,
        ownerId: "private",
        t: 123,
        accuracy: 5,
      })),
      routingEligible: true,
      contributorIds: ["private"],
    };
    const decoded = decodeCommunityCorridors([source], center);
    expect(decoded).toEqual([
      {
        id: id(1),
        revision: 1,
        sport: "run",
        widthMeters: 2,
        points: row().points,
        expiresAt: source.expires_at,
        routingEligible: false,
      },
    ]);
    decoded[0]!.points[0]!.lat = 1;
    expect(source.points[0]!.lat).toBe(0);
  });
  it.each(["ride", "run", "walk", "hike"])(
    "accepts supported %s evidence without making it navigable",
    (sport) => {
      expect(
        decodeCommunityCorridors([{ ...row(), sport }], center)[0],
      ).toMatchObject({ sport, routingEligible: false });
    },
  );
  it("omits expired evidence at the exact deadline and retains unexpired rows", () => {
    expect(
      decodeCommunityCorridors(
        [
          { ...row(1), expires_at: new Date(now - 1).toISOString() },
          { ...row(2), expires_at: new Date(now).toISOString() },
          { ...row(3), expires_at: new Date(now + 1).toISOString() },
        ],
        center,
      ).map((r) => r.id),
    ).toEqual([id(3)]);
    for (const expires_at of [undefined, null, "invalid", 1792152000000])
      expect(() =>
        decodeCommunityCorridors([{ ...row(), expires_at }], center),
      ).toThrow("could not be read");
  });
  it("bounds row count and vertex count before rendering geometry", () => {
    expect(
      decodeCommunityCorridors(
        Array.from({ length: 30 }, (_, i) => row(i + 1, 256)),
        center,
      ),
    ).toHaveLength(30);
    for (const value of [
      null,
      {},
      [null],
      Array.from({ length: 31 }, (_, i) => row(i + 1)),
      [{ ...row(), points: row(1, 10).points }],
      [{ ...row(), points: row(1, 257).points }],
      [{ ...row(), points: { lat: 0, lng: 0 } }],
    ])
      expect(() => decodeCommunityCorridors(value, center)).toThrow();
  });
  it("rejects duplicate identities, invalid revisions and unsupported sports", () => {
    expect(() => decodeCommunityCorridors([row(), row()], center)).toThrow();
    for (const patch of [
      { id: "not-a-uuid" },
      { revision: 0 },
      { revision: -1 },
      { revision: 1.5 },
      { revision: NaN },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { revision: "1" },
      { sport: "car" },
    ])
      expect(() =>
        decodeCommunityCorridors([{ ...row(), ...patch }], center),
      ).toThrow();
  });
  it("accepts inclusive width limits and rejects nonfinite, untyped or out-of-range widths", () => {
    for (const width_meters of [0.5, 20])
      expect(
        decodeCommunityCorridors([{ ...row(), width_meters }], center)[0]!
          .widthMeters,
      ).toBe(width_meters);
    for (const width_meters of [0, 0.49, 20.01, NaN, Infinity, "2", null])
      expect(() =>
        decodeCommunityCorridors([{ ...row(), width_meters }], center),
      ).toThrow();
  });
  it("rejects malformed coordinates, long segment gaps and evidence outside the requested area", () => {
    for (const point of [
      null,
      { lat: NaN, lng: 0 },
      { lat: 0, lng: Infinity },
      { lat: 86, lng: 0 },
      { lat: 0, lng: 181 },
      { lat: "0", lng: 0 },
      { lat: 0 },
    ]) {
      const points: unknown[] = row().points;
      points[3] = point;
      expect(() =>
        decodeCommunityCorridors([{ ...row(), points }], center),
      ).toThrow();
    }
    const gap = row();
    gap.points[5] = { lat: 0, lng: 0.01 };
    expect(() => decodeCommunityCorridors([gap], center)).toThrow();
    const far = row();
    far.points = far.points.map((p) => ({ lat: p.lat + 0.05, lng: p.lng }));
    expect(() => decodeCommunityCorridors([far], center)).toThrow();
    // Reviewer queues can examine distant proposals without a nearby-map center.
    expect(
      decodeCommunityCorridors([far], undefined, true)[0]!.routingEligible,
    ).toBe(false);
  });
  it.each(["proposed", "disputed"])(
    "accepts only pending review state %s, with no expiry requirement or routing permission",
    (state) => {
      const input = {
        ...row(),
        state,
        expires_at: undefined,
        routingEligible: true,
      };
      expect(decodeCommunityCorridors([input], undefined, true)[0]).toEqual({
        id: input.id,
        revision: 1,
        sport: "run",
        points: input.points,
        widthMeters: 2,
        state,
        routingEligible: false,
      });
    },
  );
  it("rejects settled or missing review states and caps the review queue at twenty", () => {
    for (const state of [undefined, null, "reviewed", "withdrawn", "unknown"])
      expect(() =>
        decodeCommunityCorridors([{ ...row(), state }], undefined, true),
      ).toThrow();
    expect(
      decodeCommunityCorridors(
        Array.from({ length: 20 }, (_, i) => row(i + 1)),
        undefined,
        true,
      ),
    ).toHaveLength(20);
    expect(() =>
      decodeCommunityCorridors(
        Array.from({ length: 21 }, (_, i) => row(i + 1)),
        undefined,
        true,
      ),
    ).toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { mappedTrack } from "../src/domain/community-tracks";
vi.mock("expo-crypto", () => ({ randomUUID: () => "area-new" }));
vi.mock("../src/storage/database", () => ({ database: new MemoryDatabase() }));
vi.mock("../src/services/route-planning", () => ({ routeProvider: {} }));
vi.mock("../src/services/path-network", () => ({ loadPathNetwork: vi.fn() }));
import {
  routingFeatures,
  saveOfflineArea,
  offlineAreas,
  type OfflineArea,
} from "../src/services/offline-maps";
import { loadPathNetwork } from "../src/services/path-network";
const now = Date.now();
const feature = mappedTrack(
  { id: 1, version: 2, nodes: [1, 2], tags: { highway: "path", foot: "yes" } },
  [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ],
);
const area: OfflineArea = {
  id: "one",
  name: "Area",
  center: { lat: 0, lng: 0 },
  radius: 1200,
  downloadedAt: now,
  lines: [],
  limited: false,
  cacheVersion: 2,
  features: [feature],
};
describe("offline routing cache compatibility", () => {
  it("allows fresh versioned features but keeps legacy, partial and stale geometry display-only", () => {
    expect(routingFeatures(area, now)).toEqual([feature]);
    for (const patch of [
      { cacheVersion: undefined },
      { features: undefined },
      { limited: true },
      { downloadedAt: now - 31 * 86400000 },
      { downloadedAt: now + 1000 },
    ]) {
      expect(routingFeatures({ ...area, ...patch }, now)).toEqual([]);
    }
  });
  it("persists provenance and node topology under the owner's cache", async () => {
    vi.mocked(loadPathNetwork).mockResolvedValue({
      lines: [
        [
          { lat: 0, lng: 0, t: 0, accuracy: 0, segment: 0 },
          { lat: 0, lng: 0.001, t: 0, accuracy: 0, segment: 0 },
        ],
      ],
      limited: false,
      features: [feature],
    });
    await saveOfflineArea("me", "Area", { lat: 0, lng: 0 });
    const [saved] = await offlineAreas("me");
    expect(saved?.cacheVersion).toBe(2);
    expect(saved?.features?.[0]).toMatchObject({
      wayId: 1,
      version: 2,
      nodeIds: [1, 2],
      tags: { foot: "yes" },
    });
    expect(await offlineAreas("other")).toEqual([]);
  });
});

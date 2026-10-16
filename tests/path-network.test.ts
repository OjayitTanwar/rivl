import { afterEach, expect, it, vi } from "vitest";
import {
  decodePathNetwork,
  pathNetworkProvider,
  pathQuery,
} from "../src/services/path-network";
import { offlineReroute } from "../src/domain/offline-routing";
import { upcomingInfrastructureWarning } from "../src/domain/infrastructure-warning";
import type { Sample } from "../src/domain/types";
const center = { lat: 51.507, lng: -0.128 };
const way = (tags: Record<string, string>) => ({
  type: "way",
  tags,
  geometry: [
    { lat: 51.5, lon: -0.1 },
    { lat: 51.501, lon: -0.101 },
  ],
});
afterEach(() => vi.useRealTimers());
it("uses a bounded area and distinct walking and cycling queries", () => {
  expect(pathQuery(center, "walk")).toContain("around:1200,51.50700,-0.12800");
  expect(pathQuery(center, "ride")).toContain("cycleway:right");
  expect(pathQuery(center, "run")).toContain("out meta geom 501");
  expect(() => pathQuery({ lat: Infinity, lng: 0 }, "run")).toThrow();
});
it("keeps disconnected ways separate and excludes restricted access", () => {
  const result = decodePathNetwork(
    {
      elements: [
        way({ highway: "footway" }),
        way({ highway: "path" }),
        way({ highway: "path", access: "private" }),
        way({ highway: "path", foot: "no" }),
        way({ highway: "path", "access:conditional": "no @ night" }),
      ],
    },
    "walk",
  );
  expect(result.lines).toHaveLength(2);
  expect(result.lines[0]?.[0]?.lng).toBe(-0.1);
  expect(result.lines[1]?.[0]?.segment).toBe(1);
});
it("does not claim generic paths or ordinary roads as cycle infrastructure", () => {
  const result = decodePathNetwork(
    {
      elements: [
        way({ highway: "path" }),
        way({ highway: "residential" }),
        way({ highway: "cycleway" }),
        way({ highway: "path", bicycle: "designated" }),
        way({ highway: "residential", "cycleway:left": "lane" }),
        way({ highway: "cycleway", bicycle: "dismount" }),
      ],
    },
    "ride",
  );
  expect(result.lines).toHaveLength(3);
});
it("keeps separate mode-safe paths in a downloaded area", () => {
  const result = decodePathNetwork(
    {
      elements: [
        way({ highway: "footway" }),
        way({ highway: "cycleway", foot: "no" }),
        way({ highway: "residential" }),
        way({ highway: "path", bicycle: "designated" }),
      ],
    },
    "all",
  );
  expect(result.lines).toHaveLength(4);
  expect(result.walkingLines).toHaveLength(2);
  expect(result.cyclingLines).toHaveLength(2);
});
it("reroutes only over connected saved ways near both endpoints", () => {
  const point = (lat: number, lng: number): Sample => ({
    lat,
    lng,
    t: 0,
    accuracy: 0,
    segment: 0,
  });
  const lines = [
    [point(0, 0), point(0, 0.001), point(0, 0.002)],
    [point(0, 0.001), point(0.001, 0.001)],
  ];
  const route = offlineReroute(lines, point(0, 0), point(0.001, 0.001));
  expect(route?.points.map((p) => [p.lat, p.lng])).toEqual([
    [0, 0],
    [0, 0.001],
    [0.001, 0.001],
  ]);
  expect(route?.steps.at(-1)?.kind).toBe("arrive");
  expect(
    route?.steps.find((step) => step.kind === "turn")?.instruction,
  ).toContain("left");
  expect(
    offlineReroute(
      [lines[0]!, [point(0.003, 0.003), point(0.004, 0.004)]],
      point(0, 0),
      point(0.004, 0.004),
    ),
  ).toBeNull();
  expect(
    offlineReroute(lines, point(0.01, 0.01), point(0.001, 0.001)),
  ).toBeNull();
});
it("warns only when upcoming mapped infrastructure is unconfirmed", () => {
  const point = (lng: number, lat = 0): Sample => ({
    lat,
    lng,
    t: 0,
    accuracy: 0,
    segment: 0,
  });
  const route = [point(0), point(0.001), point(0.002), point(0.003)];
  const mapped = [[point(0), point(0.001), point(0.002), point(0.003)]];
  expect(upcomingInfrastructureWarning(route, mapped, 0, "ride")).toBeNull();
  expect(
    upcomingInfrastructureWarning(
      route,
      [[point(0, 0.01), point(0.003, 0.01)]],
      0,
      "ride",
    ),
  ).toContain("can't confirm a mapped cycle track");
  expect(
    upcomingInfrastructureWarning(
      route,
      [[point(0, 0.01), point(0.003, 0.01)]],
      0,
      "ride",
      true,
    ),
  ).toBeNull();
});
it("bounds rendering and rejects incomplete server responses", () => {
  const result = decodePathNetwork(
    {
      elements: Array.from({ length: 501 }, () => way({ highway: "footway" })),
    },
    "run",
  );
  expect(result.lines).toHaveLength(500);
  expect(result.limited).toBe(true);
  expect(() =>
    decodePathNetwork({ elements: [], remark: "timeout" }, "run"),
  ).toThrow();
  expect(decodePathNetwork({ elements: [] }, "run").lines).toEqual([]);
});
it("rate limits repeated searches and sends only the selected area", async () => {
  const transport = vi.fn(
    async () => new Response(JSON.stringify({ elements: [] })),
  ) as unknown as typeof fetch;
  const load = pathNetworkProvider(transport, () => 1);
  await load(center, "run");
  await expect(load(center, "run")).rejects.toThrow("10 seconds");
  expect(transport).toHaveBeenCalledTimes(1);
});
it("times out even when response body reading stalls", async () => {
  vi.useFakeTimers();
  const transport = vi.fn(async () => ({
    ok: true,
    headers: new Headers(),
    text: () => new Promise(() => {}),
  })) as unknown as typeof fetch;
  const pending = expect(
    pathNetworkProvider(transport)(center, "walk"),
  ).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(20001);
  await pending;
});
it("cancels an active read without waiting for the service", async () => {
  const controller = new AbortController();
  const transport = vi.fn(
    () => new Promise(() => {}),
  ) as unknown as typeof fetch;
  const pending = expect(
    pathNetworkProvider(transport)(center, "walk", controller.signal),
  ).rejects.toThrow("cancelled");
  controller.abort();
  await pending;
});

it("retains versioned OSM geometry without contributor metadata", () => {
  const result = decodePathNetwork(
    {
      elements: [
        {
          ...way({ highway: "path", foot: "yes" }),
          id: 19,
          version: 4,
          nodes: [71, 72],
          user: "not-retained",
          uid: 7,
          changeset: 9,
        },
      ],
    },
    "all",
  );
  expect(result.features?.[0]).toMatchObject({
    wayId: 19,
    version: 4,
    nodeIds: [71, 72],
  });
  expect(result.features?.[0]).not.toHaveProperty("user");
  expect(result.features?.[0]).not.toHaveProperty("uid");
});

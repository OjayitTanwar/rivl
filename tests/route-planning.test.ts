import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendWaypoint,
  decodeRoutedLine,
  directLine,
  MAX_WAYPOINTS,
} from "../src/domain/route-planning";
import { googleGuides, osrmProvider } from "../src/services/route-planning";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stops = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.501, lng: -0.101 },
];
const route = {
  code: "Ok",
  routes: [
    {
      distance: 230,
      geometry: {
        type: "LineString",
        coordinates: [
          [-0.1, 51.5],
          [-0.1005, 51.5004],
          [-0.101, 51.501],
        ],
      },
    },
  ],
};

describe("route plans", () => {
  it("keeps direct lines explicitly unverified and calculates geodesic distance", () => {
    const line = directLine([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
    ]);
    expect(line.kind).toBe("manual");
    expect(line.distance).toBeCloseTo(1111.95, 1);
    expect(line.points).toHaveLength(2);
  });
  it("rejects impossible, oversized and duplicate stop selections", () => {
    expect(() => directLine([{ lat: Infinity, lng: 0 }])).toThrow();
    expect(() =>
      directLine(Array.from({ length: MAX_WAYPOINTS + 1 }, () => stops[0]!)),
    ).toThrow();
    expect(() => appendWaypoint(stops, stops[1]!)).toThrow("5 metres");
    expect(() =>
      directLine([
        { lat: 0, lng: 0 },
        { lat: 45, lng: 0 },
      ]),
    ).toThrow("2,000 km");
  });
  it("retains routed geometry rather than replacing it with stop-to-stop lines", () => {
    expect(decodeRoutedLine(route)).toEqual({
      kind: "paths",
      distance: 230,
      points: [
        { lng: -0.1, lat: 51.5, t: 0, accuracy: 0, segment: 0 },
        { lng: -0.1005, lat: 51.5004, t: 1000, accuracy: 0, segment: 0 },
        { lng: -0.101, lat: 51.501, t: 2000, accuracy: 0, segment: 0 },
      ],
    });
  });
  it("rejects disconnected and malformed provider responses", () => {
    expect(() => decodeRoutedLine({ code: "NoRoute" })).toThrow(
      "No connected path",
    );
    expect(() =>
      decodeRoutedLine({ code: "Ok", routes: [{ distance: -1 }] }),
    ).toThrow();
    expect(() =>
      decodeRoutedLine({
        code: "Ok",
        routes: [
          {
            distance: 1,
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0],
                [400, 0],
              ],
            },
          },
        ],
      }),
    ).toThrow();
  });
});

describe("routing provider", () => {
  const endpoints = {
    foot: "https://routing.example/routed-foot",
    bike: "https://routing.example/routed-bike",
  };
  it("keeps OSRM body reads inside the routing deadline", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(
      async () =>
        ({
          ok: true,
          headers: new Headers(),
          body: null,
          text: () => new Promise(() => {}),
        }) as Response,
    );
    const request = osrmProvider(endpoints, transport).route(stops, "walk");
    const rejected = expect(request).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps Google body reads inside the routing deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            headers: new Headers(),
            body: null,
            text: () => new Promise(() => {}),
          }) as Response,
      ),
    );
    const request = googleGuides(stops, "walk");
    const rejected = expect(request).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds Google responses before decoding them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            headers: { "content-length": "4000001" },
          }),
      ),
    );
    await expect(googleGuides(stops, "ride")).rejects.toThrow("too large");
  });
  it("requests maneuver steps for spoken guidance", async () => {
    const guided = {
      code: "Ok",
      routes: [
        {
          distance: 111,
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [0.001, 0],
            ],
          },
          legs: [
            {
              steps: [
                { maneuver: { location: [0, 0], type: "depart" } },
                { maneuver: { location: [0.001, 0], type: "arrive" } },
              ],
            },
          ],
        },
      ],
    };
    const transport = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(guided), { status: 200 }),
    );
    const result = await osrmProvider(endpoints, transport).guide(
      stops,
      "walk",
    );
    expect(String(transport.mock.calls[0]?.[0])).toContain("steps=true");
    expect(result.steps.at(-1)?.kind).toBe("arrive");
  });
  it("selects foot and bike graphs and never defaults to a driving graph", async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(route), { status: 200 }),
    );
    let time = 0;
    const provider = osrmProvider(endpoints, transport, () => time);
    await provider.route(stops, "run");
    expect(String(transport.mock.calls[0]?.[0])).toContain(
      "/routed-foot/route/v1/driving/",
    );
    time = 1101;
    await provider.route(stops, "ride");
    expect(String(transport.mock.calls[1]?.[0])).toContain(
      "/routed-bike/route/v1/driving/",
    );
    expect(String(transport.mock.calls[1]?.[0])).toContain(
      "geometries=geojson",
    );
  });
  it("rate limits explicit requests across sports", async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(route)),
    );
    const provider = osrmProvider(endpoints, transport, () => 1000);
    await provider.route(stops, "walk");
    await expect(provider.route(stops, "ride")).rejects.toThrow(
      "Wait a moment",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("requires encrypted endpoints, handles failures and respects cancellation", async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response("", { status: 429 }),
    );
    await expect(
      osrmProvider(
        { ...endpoints, foot: "http://routing.example" },
        transport,
      ).route(stops, "run"),
    ).rejects.toThrow("HTTPS");
    await expect(
      osrmProvider(endpoints, transport).route(stops, "run"),
    ).rejects.toThrow("busy");
    const controller = new AbortController();
    controller.abort();
    const unused = vi.fn();
    await expect(
      osrmProvider(endpoints, unused).route(stops, "run", controller.signal),
    ).rejects.toThrow("cancelled");
    expect(unused).not.toHaveBeenCalled();
  });
});

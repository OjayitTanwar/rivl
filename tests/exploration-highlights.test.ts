import { describe, it, expect } from "vitest";
import { exploredTiles, explorationProgress } from "../src/domain/exploration";
import { activityHighlights } from "../src/domain/activity-highlights";
import { navigationStops } from "../src/domain/navigation-stops";
import {
  decodeGooglePolyline,
  decodeGoogleRoutes,
  googleMapsUrl,
} from "../src/domain/google-maps";
import { oauthCode } from "../src/domain/oauth-callback";
import { speed } from "../src/domain/format";
import { replayIndexAt, replayTimeline } from "../src/domain/replay";
import { navigationProgress, type GuidedRoute } from "../src/domain/navigation";
import type { Sample, Activity, RoutePlan } from "../src/domain/types";
const point = (lng: number, t = 0, segment = 0): Sample => ({
  lat: 0,
  lng,
  t,
  accuracy: 5,
  segment,
});
describe("exploration and sharing measurements", () => {
  it("replays recorded pauses at their actual relative times", () => {
    const timeline = replayTimeline([
      point(0, 1000),
      point(0.001, 2000),
      point(0.001, 32000),
      point(0.002, 33000),
    ]);
    expect(timeline.timed).toBe(true);
    expect(timeline.recordedMs).toBe(32000);
    expect(replayIndexAt(timeline, 0.5)).toBe(1);
    expect(replayIndexAt(timeline, 1)).toBe(3);
    const planned = replayTimeline([point(0), point(0.001), point(0.002)], false);
    expect(planned.timed).toBe(false);
    expect(replayIndexAt(planned, 0.5)).toBe(1);
  });
  it("counts a cell once per activity, independently of repeated GPS fixes", () => {
    const p = point(0);
    expect(exploredTiles([[p, p, p]])[0]?.visits).toBe(1);
    expect(exploredTiles([[p], [p]])[0]?.visits).toBe(2);
  });
  it("fills connected paths but keeps a GPS break out of the exploration score", () => {
    const a = point(0),
      b = point(0.008, 5000);
    expect(exploredTiles([[a, b]]).length).toBeGreaterThan(4);
    expect(exploredTiles([[a, { ...b, segment: 1 }]]).length).toBe(2);
  });
  it("excludes demo and simulated activity from XP and unlocks", () => {
    const a = {
      route: [point(0)],
      startedAt: 100,
      summary: { ascent: 0 },
      simulated: true,
    } as Activity;
    expect(explorationProgress([a], 200).xp).toBe(0);
    expect(
      explorationProgress([{ ...a, simulated: false, demo: true }], 200).tiles,
    ).toHaveLength(0);
  });
  it("uses sustained recorded speed and rejects spikes, gaps and planned geometry", () => {
    const samples = Array.from({ length: 20 }, (_, i) => ({
      ...point(i * 0.0001, i * 5000),
      altitude: i,
    }));
    const best = activityHighlights(samples, "run");
    expect(best.find((h) => h.kind === "fastest")?.value).toBeCloseTo(
      2.2239,
      2,
    );
    expect(best.find((h) => h.kind === "highest")?.value).toBe(19);
    expect(
      activityHighlights(
        samples.map((p) => ({ ...p, t: 0 })),
        "run",
      ).find((h) => h.kind === "fastest"),
    ).toBeUndefined();
    expect(activityHighlights([point(0), point(1, 5000)], "run")).toHaveLength(
      0,
    );
  });
  it("converts speed using the selected unit", () => {
    expect(speed(10, "kmh")).toBe("36.0");
    expect(speed(10, "mph")).toBe("22.4");
  });
});
describe("route navigation and provider boundaries", () => {
  it("keeps saved route shape when joining midway and can reverse it", () => {
    const points = [point(0), point(0.001), point(0.002), point(0.003)];
    const route = { points } as RoutePlan;
    expect(navigationStops(points[1]!, route).at(-1)?.lng).toBe(0.003);
    expect(navigationStops(points[1]!, route, true).at(-1)?.lng).toBe(0);
  });
  it("does not instantly arrive at the shared start and finish of a loop", () => {
    const points = [
      point(0),
      { ...point(0.002), lat: 0.002 },
      point(0.004),
      point(0),
    ];
    const route = {
      points,
      distance: 1073,
      kind: "paths",
      steps: [
        {
          kind: "arrive",
          location: points[0]!,
          distanceAlong: 1073,
          instruction: "Arrived",
        },
      ],
    } as GuidedRoute;
    expect(navigationProgress(route, points[0]!, 5).arrived).toBe(false);
    expect(navigationProgress(route, points[0]!, 80, 1060).arrived).toBe(false);
    expect(navigationProgress(route, points[0]!, 5, 1060).arrived).toBe(true);
  });
  it("decodes Google geometry and rejects truncated responses", () => {
    const points = decodeGooglePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points[0]?.lat).toBe(38.5);
    expect(points[2]?.lng).toBe(-126.453);
    expect(() => decodeGooglePolyline("_p~iF")).toThrow();
    expect(
      decodeGoogleRoutes({
        routes: [
          {
            distanceMeters: 1000,
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
          },
        ],
      })[0]?.provider,
    ).toBe("google");
  });
  it("encodes Google Maps destinations and accepts only our OAuth return URI", () => {
    const url = new URL(googleMapsUrl("Cafe & Park", "ride"));
    expect(url.searchParams.get("destination")).toBe("Cafe & Park");
    expect(url.searchParams.get("travelmode")).toBe("bicycling");
    expect(oauthCode("rivl://auth-callback?code=abc")).toBe("abc");
    expect(() => oauthCode("https://evil.test/?code=abc")).toThrow();
    expect(() => oauthCode("rivl://auth-callback?error=denied")).toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { googleMapDocument, mapPayload } from "../src/ui/google-map-document";
import type { Sample } from "../src/domain/types";

const point = (lng: number, segment = 0): Sample => ({
  lat: 51.5,
  lng,
  t: lng + 1000,
  accuracy: 5,
  segment,
});
function renderer() {
  const shapes: object[] = [];
  const options: Record<string, unknown>[] = [];
  let mapType = "roadmap";
  const map = {
    setOptions: vi.fn(),
    data: {
      forEach: vi.fn(),
      remove: vi.fn(),
      addGeoJson: vi.fn(),
      setStyle: vi.fn(),
    },
    panTo: vi.fn(),
    setZoom: vi.fn(),
    setCenter: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: () => 15,
    addListener: vi.fn(),
    setMapTypeId: vi.fn((type: string) => {
      mapType = type;
    }),
    getMapTypeId: () => mapType,
  };
  class Shape {
    setPath = vi.fn();
    setMap = vi.fn();
    setPosition = vi.fn();
    setTitle = vi.fn();
    setIcon = vi.fn();
    setOptions = vi.fn();
    constructor() {
      shapes.push(this);
    }
  }
  class Bounds {
    empty = true;
    extend() {
      this.empty = false;
    }
    isEmpty() {
      return this.empty;
    }
  }
  const window: Record<string, any> = {
    ReactNativeWebView: { postMessage: vi.fn() },
    addEventListener: vi.fn(),
  };
  const script = googleMapDocument("test-key").match(
    /<script>([\s\S]*?)<\/script>/,
  )![1]!;
  runInNewContext(script, {
    window,
    document: {
      documentElement: { style: {} },
      body: { style: {} },
      getElementById: () => ({ style: {} }),
    },
    google: {
      maps: {
        Map: class {
          constructor(_element: object, value: Record<string, unknown>) {
            options.push(value);
            return map;
          }
        },
        LatLngBounds: Bounds,
        Polyline: Shape,
        Marker: Shape,
        Circle: Shape,
        SymbolPath: { CIRCLE: 0 },
        event: { addListenerOnce: vi.fn() },
      },
    },
  });
  window.initMap();
  return {
    map,
    window,
    shapes,
    options,
    draw: (props: object) =>
      window.draw(
        JSON.parse(
          mapPayload({ points: [point(0), point(0.001)], ...props }, false),
        ),
      ),
  };
}
describe("Google map updates", () => {
  it("preserves exploration gaps and reuses the atlas strokes while panning", () => {
    const explorationRoutes = [
      [point(0), point(0.001), point(0.01, 1), point(0.011, 1)],
    ];
    const payload = JSON.parse(
      mapPayload({ points: [], explorationRoutes }, false),
    );
    expect(payload.exploration).toHaveLength(2);
    expect(
      payload.exploration.every((trace: { latest: boolean }) => trace.latest),
    ).toBe(true);
    const r = renderer();
    r.draw({ points: [], explorationRoutes, center: point(0) });
    const count = r.shapes.length;
    r.draw({ points: [], explorationRoutes, center: point(0.02) });
    expect(r.shapes.length).toBe(count);
    expect(r.map.fitBounds).toHaveBeenCalledTimes(1);
  });
  it("moves position and replay markers without recreating route overlays or refitting", () => {
    const r = renderer();
    r.draw({ waypoints: [point(0)] });
    const shapes = r.shapes.length;
    r.draw({ waypoints: [point(0.001)] });
    expect(r.map.fitBounds).toHaveBeenCalledTimes(1);
    expect(r.shapes.length).toBe(shapes);
  });
  it("preserves zoom during GPS updates and lets a pan suspend following", () => {
    const r = renderer();
    r.draw({ center: point(0), showUserLocation: true, followUser: true });
    r.draw({ center: point(0.001), showUserLocation: true, followUser: true });
    expect(r.map.setZoom).toHaveBeenCalledTimes(1);
    expect(r.map.panTo).toHaveBeenCalledTimes(2);
    const drag = r.map.addListener.mock.calls.find(
      (call) => call[0] === "dragstart",
    )![1];
    drag();
    r.draw({
      center: point(0.002),
      showUserLocation: true,
      followUser: true,
      points: [point(0), point(0.002)],
    });
    expect(r.map.panTo).toHaveBeenCalledTimes(2);
    expect(r.map.fitBounds).not.toHaveBeenCalled();
    r.window.recenter();
    expect(r.map.panTo).toHaveBeenCalledTimes(3);
  });
  it("waits for an actual area and never starts with a world camera", () => {
    const r = renderer();
    expect(r.options).toHaveLength(0);
    r.draw({ points: [], localFocus: true });
    expect(r.options).toHaveLength(0);
    r.draw({
      points: [],
      center: point(0),
      localFocus: true,
      cells: [{ ...point(120), visits: 1 }],
    });
    expect(r.options[0]).toMatchObject({
      center: { lat: 51.5, lng: 0 },
      zoom: 14,
      minZoom: 10,
    });
    expect(r.map.fitBounds).not.toHaveBeenCalled();
    r.draw({
      points: [],
      center: point(0),
      localFocus: true,
      cells: [{ ...point(130), visits: 2 }],
    });
    expect(r.map.fitBounds).not.toHaveBeenCalled();
  });
  it("keeps separate GPS segments separate", () => {
    const p = JSON.parse(
      mapPayload(
        { points: [point(0), point(0.001), point(0.01, 1), point(0.011, 1)] },
        false,
      ),
    );
    expect(p.lines).toHaveLength(2);
  });
});

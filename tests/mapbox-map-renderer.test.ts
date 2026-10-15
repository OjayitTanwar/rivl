import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import {
  mapboxMapDocument,
  mapPayload,
  MAPBOX_GL_VERSION,
} from "../src/ui/mapbox-map-document";
import type { Sample } from "../src/domain/types";
import type { MapProps } from "../src/ui/map-types";

const point = (lng: number, segment = 0): Sample => ({
  lat: 51.5,
  lng,
  t: 1000 + lng,
  accuracy: 5,
  segment,
});
function renderer(token = "pk.test", supported = true) {
  const sources = new Map<
    string,
    { data: any; setData: ReturnType<typeof vi.fn> }
  >();
  const layers = new Map<string, any>();
  const handlers = new Map<string, (event?: any) => void>();
  const windowHandlers = new Map<string, (event?: any) => void>();
  const options: any[] = [];
  const messages: any[] = [];
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() });
  const map = {
    on: vi.fn((name: string, callback: (event?: any) => void) =>
      handlers.set(name, callback),
    ),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, value: any) => {
      const source = {
        data: value.data,
        setData: vi.fn((data: any) => {
          source.data = data;
        }),
      };
      sources.set(id, source);
    }),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((value: any) => layers.set(value.id, value)),
    setPaintProperty: vi.fn(),
    setMinZoom: vi.fn(),
    addControl: vi.fn(),
    fitBounds: vi.fn(),
    jumpTo: vi.fn(),
    easeTo: vi.fn(),
    setStyle: vi.fn(() => {
      sources.clear();
      layers.clear();
    }),
    getZoom: () => 15,
    getCenter: () => ({ lat: 51.5, lng: 0.003 }),
    areTilesLoaded: () => true,
    remove: vi.fn(),
    dragPan: handler(),
    scrollZoom: handler(),
    boxZoom: handler(),
    doubleClickZoom: handler(),
    touchZoomRotate: handler(),
    keyboard: handler(),
  };
  class Bounds {
    coordinates: number[][] = [];
    extend(coordinate: number[]) {
      this.coordinates.push(coordinate);
      return this;
    }
    isEmpty() {
      return this.coordinates.length === 0;
    }
  }
  const parent = { postMessage: vi.fn() };
  const window: Record<string, any> = {
    parent,
    ReactNativeWebView: {
      postMessage: vi.fn((value: string) => messages.push(JSON.parse(value))),
    },
    addEventListener: vi.fn((name: string, callback: (event?: any) => void) =>
      windowHandlers.set(name, callback),
    ),
  };
  const script = mapboxMapDocument(token).match(
    /<script>([\s\S]*?)<\/script>/,
  )![1]!;
  runInNewContext(script, {
    window,
    mapboxgl: {
      supported: () => supported,
      Map: class {
        constructor(value: object) {
          options.push(value);
          return map;
        }
      },
      LngLatBounds: Bounds,
      AttributionControl: class {},
    },
  });
  window.initMapbox();
  const draw = (props: Partial<MapProps>, reduceMotion = false) =>
    window.draw({
      ...JSON.parse(
        mapPayload({ points: [point(0), point(0.001)], ...props }, false),
      ),
      reduceMotion,
    });
  return {
    map,
    window,
    parent,
    windowHandlers,
    sources,
    layers,
    options,
    messages,
    draw,
    emit: (name: string, value?: any) => handlers.get(name)?.(value),
  };
}

describe("Mapbox route renderer", () => {
  it("waits for real geography, starts locally, and keeps official attribution", () => {
    const r = renderer();
    r.draw({ points: [], localFocus: true });
    expect(r.options).toHaveLength(0);
    r.draw({
      points: [],
      center: point(0),
      localFocus: true,
      cells: [{ ...point(130), visits: 3 }],
    });
    expect(r.options).toHaveLength(1);
    expect(r.options[0]).toMatchObject({
      center: [0, 51.5],
      zoom: 14,
      minZoom: 10,
      logoPosition: "bottom-left",
    });
    expect(r.map.addControl).toHaveBeenCalledWith(
      expect.any(Object),
      "bottom-right",
    );
    r.emit("style.load");
    expect(r.map.fitBounds).not.toHaveBeenCalled();
    r.draw({
      points: [],
      center: point(0),
      localFocus: true,
      cells: [{ ...point(140), visits: 4 }],
    });
    expect(r.options).toHaveLength(1);
    expect(r.map.fitBounds).not.toHaveBeenCalled();
  });
  it("preserves GPS and exploration gaps, and reuses sources and layers", () => {
    const r = renderer();
    const route = [point(0), point(0.001), point(0.01, 1), point(0.011, 1)];
    r.draw({
      points: route,
      explorationRoutes: [route],
      showUserLocation: true,
      center: point(0),
    });
    r.emit("style.load");
    expect(r.sources.get("rivl-routes")!.data.features).toHaveLength(2);
    expect(r.sources.get("rivl-exploration")!.data.features).toHaveLength(2);
    const routeSource = r.sources.get("rivl-routes")!;
    const sourceCount = r.map.addSource.mock.calls.length;
    const layerCount = r.map.addLayer.mock.calls.length;
    r.draw({
      points: route,
      explorationRoutes: [route],
      showUserLocation: true,
      center: point(0.003),
    });
    expect(r.options).toHaveLength(1);
    expect(r.map.addSource).toHaveBeenCalledTimes(sourceCount);
    expect(r.map.addLayer).toHaveBeenCalledTimes(layerCount);
    expect(routeSource.setData).not.toHaveBeenCalled();
    expect(r.map.fitBounds).toHaveBeenCalledTimes(1);
    expect(
      r.sources.get("rivl-markers")!.data.features.at(-1).geometry.coordinates,
    ).toEqual([0.003, 51.5]);
  });
  it("updates existing line data for new GPS points and clears removed overlays", () => {
    const r = renderer();
    r.draw({
      highlights: [
        {
          title: "Selected effort",
          color: "#123456",
          points: [point(0), point(0.001)],
        },
      ],
    });
    r.emit("style.load");
    const source = r.sources.get("rivl-routes")!;
    const highlighted = r.sources.get("rivl-highlights")!;
    r.draw({ points: [point(0), point(0.001), point(0.002)], highlights: [] });
    expect(source.setData).toHaveBeenCalledTimes(1);
    expect(source.data.features[0].geometry.coordinates).toHaveLength(3);
    expect(highlighted.data.features).toHaveLength(0);
    expect(r.options).toHaveLength(1);
  });
  it("follows without resetting zoom and lets user panning pause following until recenter", () => {
    const r = renderer();
    r.draw({ center: point(0), followUser: true, showUserLocation: true });
    r.emit("style.load");
    expect(r.map.easeTo.mock.calls[0]![0]).toMatchObject({ zoom: 16 });
    r.draw({ center: point(0.001), followUser: true, showUserLocation: true });
    expect(r.map.easeTo.mock.calls[1]![0]).not.toHaveProperty("zoom");
    r.emit("dragstart");
    r.draw({
      center: point(0.002),
      followUser: true,
      showUserLocation: true,
      points: [point(0), point(0.002)],
    });
    expect(r.map.easeTo).toHaveBeenCalledTimes(2);
    expect(r.map.fitBounds).not.toHaveBeenCalled();
    r.window.recenter();
    expect(r.map.easeTo).toHaveBeenCalledTimes(3);
    expect(r.map.easeTo.mock.calls[2]![0].center).toEqual([0.002, 51.5]);
  });
  it("restores route overlays after changing style while preserving the camera", () => {
    const r = renderer();
    r.draw({});
    r.emit("style.load");
    expect(r.map.fitBounds).toHaveBeenCalledTimes(1);
    r.window.mapType("satellite");
    expect(r.map.setStyle).toHaveBeenCalledWith(
      "mapbox://styles/mapbox/satellite-streets-v12",
    );
    expect(r.sources.size).toBe(0);
    r.emit("style.load");
    expect(r.sources.get("rivl-routes")!.data.features).toHaveLength(1);
    expect(r.map.fitBounds).toHaveBeenCalledTimes(1);
    r.draw({ mapStyle: "terrain" });
    expect(r.map.setStyle).toHaveBeenLastCalledWith(
      "mapbox://styles/mapbox/outdoors-v12",
    );
    r.emit("style.load");
    expect(r.options).toHaveLength(1);
  });
  it("draws manual dashes, waypoints, highlights, density, and real exploration tiles", () => {
    const r = renderer();
    r.draw({
      unverified: true,
      waypoints: [point(0), point(0.001)],
      cells: [{ ...point(0.001), visits: 8 }],
      highlights: [
        { title: "Effort", color: "#123456", points: [point(0), point(0.001)] },
      ],
      tiles: [{ id: "tile", lat: 51.5, lng: 0, visits: 1 }],
    });
    r.emit("style.load");
    expect(r.layers.get("rivl-route-manual").paint["line-dasharray"]).toEqual([
      2, 2,
    ]);
    expect(
      r.sources.get("rivl-routes")!.data.features[0].properties.unverified,
    ).toBe(true);
    expect(
      r.sources.get("rivl-highlights")!.data.features[0].properties.title,
    ).toBe("Effort");
    expect(
      r.sources
        .get("rivl-markers")!
        .data.features.map((f: any) => f.properties.title),
    ).toEqual(["Start", "Finish", "Stop 1", "Stop 2", "Effort"]);
    expect(r.sources.get("rivl-tiles")!.data.features).toHaveLength(1);
    // Tile view intentionally suppresses density cells, matching the common payload.
    expect(r.sources.get("rivl-density")!.data.features).toHaveLength(0);
  });
  it("reports ready, loading, loaded, viewport, and sanitized token errors", () => {
    const r = renderer();
    expect(r.messages).toContainEqual({ type: "ready" });
    r.draw({});
    r.emit("style.load");
    r.emit("idle");
    r.emit("moveend");
    r.emit("click", { lngLat: { lat: 51.5, lng: 0.005 } });
    r.emit("error", {
      error: { status: 401, message: "Sensitive URL must not escape" },
    });
    expect(r.messages).toContainEqual({ type: "loading" });
    expect(r.messages).toContainEqual({ type: "loaded" });
    expect(r.messages).toContainEqual({
      type: "viewport",
      lat: 51.5,
      lng: 0.003,
    });
    expect(r.messages).toContainEqual({ type: "point", lat: 51.5, lng: 0.005 });
    expect(r.messages.at(-1)).toEqual({ type: "error", reason: "token" });
  });
  it("honors noninteractive state, Reduce Motion, and parent-message boundaries", () => {
    const r = renderer();
    r.draw({ center: point(0), followUser: true, interactive: false }, true);
    r.emit("style.load");
    expect(r.map.easeTo.mock.calls[0]![0].duration).toBe(0);
    expect(r.map.dragPan.disable).toHaveBeenCalled();
    expect(r.map.keyboard.disable).toHaveBeenCalled();
    r.emit("click", { lngLat: point(0.005) });
    expect(r.messages.some((message) => message.type === "point")).toBe(false);
    r.windowHandlers.get("message")?.({
      source: {},
      data: { rivlMap: true, type: "mapType", value: "satellite" },
    });
    expect(r.map.setStyle).not.toHaveBeenCalled();
    r.windowHandlers.get("message")?.({
      source: r.parent,
      data: { rivlMap: true, type: "mapType", value: "satellite" },
    });
    expect(r.map.setStyle).toHaveBeenCalledTimes(1);
  });
  it("fails honestly for a missing token or unavailable WebGL", () => {
    const missing = renderer("");
    expect(missing.messages).toEqual([{ type: "error", reason: "token" }]);
    missing.draw({});
    expect(missing.options).toHaveLength(0);
    expect(renderer("pk.test", false).messages).toEqual([
      { type: "error", reason: "unsupported" },
    ]);
    const html = mapboxMapDocument("pk.</script><script>alert(1)</script>");
    expect(html).not.toContain("pk.</script>");
    expect(html).toContain(
      `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js`,
    );
  });
});

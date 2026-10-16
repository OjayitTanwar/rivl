import type { Coordinate, Sample, Sport } from "../domain/types";
import { coordinate } from "../domain/route-planning";
import { AppFailure } from "../security/errors";
import { apiFetch } from "../security/transport";
import { mappedTrack, type MappedTrack } from "../domain/community-tracks";

export type PathNetwork = {
  lines: Sample[][];
  limited: boolean;
  walkingLines?: Sample[][];
  cyclingLines?: Sample[][];
  features?: MappedTrack[];
};
const allowed = /^(yes|designated|official|permissive)$/;
const bikeLane =
  /^(lane|track|opposite_lane|opposite_track|shared_lane|share_busway)$/;
export function pathQuery(center: Coordinate, sport: Sport | "all") {
  const { lat, lng } = coordinate(center);
  const around = `(around:1200,${lat.toFixed(5)},${lng.toFixed(5)})`;
  const selectors =
    sport === "all"
      ? ["[highway]", '[leisure=track][sport~"^(running|athletics)$"]']
      : sport === "ride"
        ? [
            "[highway=cycleway]",
            '[highway~"^(path|footway|track)$"][bicycle~"^(yes|designated|official|permissive)$"]',
            ...[
              "cycleway",
              "cycleway:left",
              "cycleway:right",
              "cycleway:both",
            ].map(
              (key) =>
                `[highway]["${key}"~"^(lane|track|opposite_lane|opposite_track|shared_lane|share_busway)$"]`,
            ),
          ]
        : [
            '[highway~"^(footway|path|pedestrian|steps)$"]',
            '[highway=track][foot~"^(yes|designated|official|permissive)$"]',
            ...(sport === "run"
              ? ['[leisure=track][sport~"^(running|athletics)$"]']
              : []),
          ];
  return `[out:json][timeout:15][maxsize:8388608];(${selectors.map((s) => `way${around}${s};`).join("")});out meta geom 501;`;
}
export function decodePathNetwork(
  value: unknown,
  sport: Sport | "all",
): PathNetwork {
  const data = value as { elements?: unknown; remark?: unknown } | null;
  if (!data || data.remark || !Array.isArray(data.elements))
    throw new AppFailure(
      "server",
      "Path data is unavailable. Try again later.",
      true,
    );
  const lines: Sample[][] = [];
  const walkingLines: Sample[][] = [];
  const cyclingLines: Sample[][] = [];
  const features: MappedTrack[] = [];
  let count = 0;
  let limited = data.elements.length > 500;
  for (const element of data.elements.slice(0, 500)) {
    if (!element || typeof element !== "object") continue;
    const way = element as {
      id?: unknown;
      version?: unknown;
      nodes?: unknown;
      type?: string;
      tags?: Record<string, string>;
      geometry?: Coordinate[];
    };
    const metadata = mappedTrack(way, []);
    const tags = metadata.tags;
    const mode = sport === "ride" ? "bicycle" : "foot";
    // Be conservative about tagged restrictions; this is discovery, not access verification.
    const unusable = (access: MappedTrack["footAccess"]) =>
      access === "mapped_restricted" || access === "conditional";
    if (
      sport === "all"
        ? unusable(metadata.footAccess) && unusable(metadata.bicycleAccess)
        : unusable(
            mode === "bicycle" ? metadata.bicycleAccess : metadata.footAccess,
          )
    )
      continue;
    const walkSuitable =
      !unusable(metadata.footAccess) &&
      (/^(footway|path|pedestrian|steps)$/.test(tags.highway ?? "") ||
        (tags.leisure === "track" &&
          /^(running|athletics)$/.test(tags.sport ?? "")) ||
        allowed.test(tags.foot ?? ""));
    const cycleSuitable =
      !unusable(metadata.bicycleAccess) &&
      (tags.highway === "cycleway" ||
        (/^(path|footway|track)$/.test(tags.highway ?? "") &&
          allowed.test(tags.bicycle ?? "")) ||
        ["cycleway", "cycleway:left", "cycleway:right", "cycleway:both"].some(
          (k) => bikeLane.test(tags[k] ?? ""),
        ));
    const suitable =
      sport === "all"
        ? !!tags.highway ||
          (tags.leisure === "track" &&
            /^(running|athletics)$/.test(tags.sport ?? ""))
        : sport === "ride"
          ? cycleSuitable
          : walkSuitable;
    if (
      !suitable ||
      way.type !== "way" ||
      !Array.isArray(way.geometry) ||
      way.geometry.length < 2
    )
      continue;
    if (count + way.geometry.length > 20000) {
      limited = true;
      continue;
    }
    try {
      const line = way.geometry.map((p) => ({
        ...coordinate({
          lat: p.lat,
          lng: (p as Coordinate & { lon?: number }).lon ?? p.lng,
        }),
        t: 0,
        accuracy: 0,
        segment: lines.length,
      }));
      count += line.length;
      lines.push(line);
      const feature = mappedTrack(way, line);
      features.push(feature);
      if (sport === "all") {
        // Area outlines and ambiguous leisure-track polygons are display only.
        if (walkSuitable && feature.geometryKind === "line")
          walkingLines.push(line);
        if (cycleSuitable && feature.geometryKind === "line")
          cyclingLines.push(line);
      }
    } catch {
      /* Malformed ways never become partial connecting lines. */
    }
  }
  return sport === "all"
    ? { lines, limited, walkingLines, cyclingLines, features }
    : { lines, limited, features };
}
export function pathNetworkProvider(
  transport: typeof fetch = fetch,
  now = Date.now,
) {
  let last = -Infinity;
  return async (
    center: Coordinate,
    sport: Sport | "all",
    signal?: AbortSignal,
  ): Promise<PathNetwork> => {
    const query = pathQuery(center, sport);
    if (signal?.aborted)
      throw new AppFailure("cancelled", "Path search cancelled.");
    if (now() - last < 10000)
      throw new AppFailure(
        "rate_limit",
        "Wait 10 seconds before searching another area.",
        true,
      );
    last = now();
    const controller = new AbortController();
    let expired = false;
    let rejectStop: (error: unknown) => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      rejectStop = reject;
    });
    const cancel = () => {
      controller.abort();
      rejectStop(
        new AppFailure(
          expired ? "timeout" : "cancelled",
          expired
            ? "Path search timed out. Try again later."
            : "Path search cancelled.",
          expired,
        ),
      );
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      expired = true;
      cancel();
    }, 20000);
    const endpoint = "https://overpass-api.de/api/interpreter";
    const url = new URL(endpoint);
    url.searchParams.set("data", query);
    try {
      return await Promise.race([
        stopped,
        (async () => {
          const response = await apiFetch(endpoint, transport)(url.href, {
            signal: controller.signal,
            headers: {
              "User-Agent": "RIVL/1.0 (path discovery)",
              Accept: "application/json",
            },
          });
          if (!response.ok)
            throw new AppFailure(
              "server",
              "The free path service is busy. Try again later.",
              true,
            );
          if (Number(response.headers.get("content-length") ?? 0) > 4_000_000)
            throw new AppFailure(
              "server",
              "This area has too much path data. Choose another area.",
            );
          const body = await response.text();
          if (body.length > 4_000_000)
            throw new AppFailure(
              "server",
              "This area has too much path data. Choose another area.",
            );
          let data: unknown;
          try {
            data = JSON.parse(body);
          } catch {
            throw new AppFailure(
              "server",
              "Path data could not be read. Try again later.",
              true,
            );
          }
          return decodePathNetwork(data, sport);
        })(),
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  };
}
export const loadPathNetwork = pathNetworkProvider();

import { adminClient, json } from "../_shared/admin.ts";
import { mappedTrack } from "../_shared/mapped-track.ts";
import {
  processTrackMapping,
  type TrackMappingPort,
} from "../_shared/track-mapping-worker.ts";
import type { Coordinate } from "../_shared/track-types.ts";
async function authorized(actual: string, expected: string) {
  const enc = new TextEncoder();
  const hashes = await Promise.all(
    [actual, expected].map((v) =>
      crypto.subtle.digest("SHA-256", enc.encode(v)),
    ),
  );
  const a = new Uint8Array(hashes[0]!),
    b = new Uint8Array(hashes[1]!);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
async function fetchWays(center: Coordinate) {
  // Stable area buckets, never a transmitted personal trace. The database caps
  // global claims and spaces them; this is a small discovery pilot, not a crawler.
  const lat = (Math.floor(center.lat * 100) + 0.5) / 100;
  const lng = (Math.floor(center.lng * 100) + 0.5) / 100;
  const query = `[out:json][timeout:12][maxsize:4194304];(way(around:1200,${lat},${lng})[highway];way(around:1200,${lat},${lng})[leisure=track][sport~"^(running|athletics)$"];);out meta geom 501;`;
  const url = new URL("https://overpass-api.de/api/interpreter");
  url.searchParams.set("data", query);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "RIVL/1.0 bounded community mapping",
    },
    signal: AbortSignal.timeout(18000),
    redirect: "error",
  });
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length") ?? 0) > 4000000
  )
    throw new Error("map_provider_unavailable");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4000000) throw new Error("map_response_limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data.remark || !Array.isArray(data.elements))
    throw new Error("invalid_map_response");
  // A truncated network could hide a competing parallel path. Decline matching
  // rather than pretend the returned subset establishes an unambiguous choice.
  if (data.elements.length > 500) throw new Error("map_area_too_dense");
  let vertices = 0;
  const ways = [];
  for (const way of data.elements) {
    if (
      way?.type !== "way" ||
      !Array.isArray(way.geometry) ||
      way.geometry.length < 2
    )
      continue;
    const points = way.geometry.map((p: { lat: number; lon: number }) => ({
      lat: p.lat,
      lng: p.lon,
    }));
    if (
      points.some(
        (p: Coordinate) =>
          !Number.isFinite(p.lat) ||
          !Number.isFinite(p.lng) ||
          Math.abs(p.lat) > 85 ||
          Math.abs(p.lng) > 180,
      )
    )
      throw new Error("invalid_map_geometry");
    vertices += points.length;
    if (vertices > 12000) throw new Error("map_vertex_limit");
    const feature = mappedTrack(way, points);
    if (!feature.wayId || !feature.version || !feature.nodeIds)
      throw new Error("map_provenance_incomplete");
    ways.push(feature);
  }
  return ways;
}
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const secret =
      Deno.env.get("RIVL_TRACK_WORKER_SECRET") ??
      Deno.env.get("RIVL_SEGMENT_WORKER_SECRET"),
    header = request.headers.get("Authorization") ?? "";
  if (
    !secret ||
    secret.length < 32 ||
    header.length > 256 ||
    !(await authorized(header, "Bearer " + secret))
  )
    return json({ error: "unauthorized" }, 401);
  try {
    const admin = adminClient();
    const port: TrackMappingPort = {
      async claim() {
        const { data, error } = await admin.rpc("claim_track_mapping_job");
        if (error) throw error;
        return data?.[0] ?? null;
      },
      async input(job) {
        const { data, error } = await admin.rpc("track_mapping_job_input", {
          p_activity: job.activity_id,
          p_lease: job.lease,
        });
        if (error) throw error;
        return data;
      },
      ways: fetchWays,
      async complete(job, ways, support, algorithm, fingerprint) {
        const { data, error } = await admin.rpc("complete_track_mapping_job", {
          p_activity: job.activity_id,
          p_lease: job.lease,
          p_revision: job.revision,
          p_algorithm: algorithm,
          p_fingerprint: fingerprint,
          p_ways: ways.map((w) => ({
            wayId: w.wayId,
            version: w.version,
            points: w.points,
            tags: w.tags,
            nodeIds: w.nodeIds,
          })),
          p_support: support,
        });
        if (error) throw error;
        return data === true;
      },
      async retry(job) {
        const { error } = await admin.rpc("retry_track_mapping_job", {
          p_activity: job.activity_id,
          p_lease: job.lease,
        });
        if (error) throw error;
      },
    };
    return json({ state: await processTrackMapping(port) });
  } catch {
    return json({ error: "worker_retry_required" }, 503);
  }
});

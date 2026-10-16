import type {
  Coordinate,
  MappedTrack,
  MappedTrackKind,
  MappedAccess,
} from "./track-types.ts";
export type {
  MappedTrack,
  MappedTrackKind,
  MappedAccess,
} from "./track-types.ts";
const retainedTags = [
  "highway",
  "leisure",
  "area",
  "foot",
  "bicycle",
  "access",
  "vehicle",
  "vehicle:conditional",
  "foot:conditional",
  "bicycle:conditional",
  "access:conditional",
  "fee",
  "segregated",
  "surface",
  "sac_scale",
  "tracktype",
  "smoothness",
  "incline",
  "lit",
  "oneway",
  "oneway:bicycle",
  "oneway:foot",
  "junction",
  "oneway:conditional",
  "oneway:bicycle:conditional",
  "oneway:foot:conditional",
  "layer",
  "bridge",
  "tunnel",
  "cycleway",
  "cycleway:left",
  "cycleway:right",
  "cycleway:both",
  "footway",
  "barrier",
  "crossing",
  "sport",
  "athletics",
];
const restricted =
  /^(no|private|customers|destination|permit|delivery|agricultural|forestry|use_sidepath|dismount|discouraged)$/;
const affirmative = /^(yes|designated|official|permissive)$/;
export function mappedAccess(
  tags: Record<string, string>,
  mode: "foot" | "bicycle",
): MappedAccess {
  const inherited =
    mode === "bicycle" ? (tags.vehicle ?? tags.access) : tags.access;
  const permission = tags[mode] ?? inherited;
  if (
    tags[`${mode}:conditional`] ||
    tags["access:conditional"] ||
    (mode === "bicycle" && tags["vehicle:conditional"]) ||
    tags.fee === "yes"
  )
    return "conditional";
  if (restricted.test(permission ?? "")) return "mapped_restricted";
  if (affirmative.test(permission ?? "")) return "mapped_allowed";
  // Regional implicit access differs; a highway name alone is not permission.
  return "unknown";
}
function direction(value: string | undefined): MappedTrack["bicycleDirection"] {
  return value === "yes" || value === "1"
    ? "forward"
    : value === "-1"
      ? "reverse"
      : value === "no" || value === "0"
        ? "both"
        : "unknown";
}
function booleanTag(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  if (value === "no") return false;
  return /^(yes|viaduct|boardwalk|movable|covered|building_passage|culvert)$/.test(
    value,
  )
    ? true
    : null;
}
/** Preserve map claims and provenance, never upgrade them into observed safety. */
export function mappedTrack(
  way: { id?: unknown; version?: unknown; nodes?: unknown; tags?: unknown },
  points: Coordinate[],
): MappedTrack {
  const raw =
    way.tags && typeof way.tags === "object" && !Array.isArray(way.tags)
      ? (way.tags as Record<string, unknown>)
      : {};
  const tags: Record<string, string> = {};
  for (const key of retainedTags)
    if (typeof raw[key] === "string" && (raw[key] as string).length <= 200)
      tags[key] = raw[key] as string;
  const laneTags = [
    tags.cycleway,
    tags["cycleway:left"],
    tags["cycleway:right"],
    tags["cycleway:both"],
  ];
  const kind: MappedTrackKind =
    tags.highway === "cycleway"
      ? "cycleway"
      : laneTags.some((v) => v === "lane" || v === "opposite_lane")
        ? "painted_cycle_lane"
        : laneTags.some((v) => v === "shared_lane" || v === "share_busway")
          ? "shared_cycle_lane"
          : tags.leisure === "track" &&
              /^(running|athletics)$/.test(tags.sport ?? "")
            ? "running_track"
            : tags.highway === "path" &&
                affirmative.test(tags.foot ?? "") &&
                affirmative.test(tags.bicycle ?? "")
              ? "shared_path"
              : /^(footway|pedestrian|steps)$/.test(tags.highway ?? "")
                ? "pedestrian_path"
                : /^(path|track)$/.test(tags.highway ?? "")
                  ? "trail"
                  : /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)(?:_link)?$/.test(
                        tags.highway ?? "",
                      )
                    ? "road"
                    : "unknown";
  const layer =
    tags.layer !== undefined &&
    /^-?\d+$/.test(tags.layer) &&
    Math.abs(Number(tags.layer)) <= 100
      ? Number(tags.layer)
      : null;
  const positive = (n: unknown): n is number =>
    typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  const nodeIds =
    Array.isArray(way.nodes) &&
    way.nodes.length === points.length &&
    way.nodes.every(positive)
      ? ([...way.nodes] as number[])
      : undefined;
  return {
    source: "osm",
    ...(positive(way.id) ? { wayId: way.id } : {}),
    ...(positive(way.version) ? { version: way.version } : {}),
    ...(nodeIds ? { nodeIds } : {}),
    points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
    tags,
    kind,
    footAccess: mappedAccess(tags, "foot"),
    bicycleAccess: mappedAccess(tags, "bicycle"),
    userSegregation:
      tags.segregated === "yes"
        ? "mapped_segregated"
        : tags.segregated === "no"
          ? "mapped_shared"
          : "unknown",
    motorProtection: "unknown",
    layer,
    bridge: booleanTag(tags.bridge),
    tunnel: booleanTag(tags.tunnel),
    bicycleDirection: direction(tags["oneway:bicycle"] ?? tags.oneway),
    surface: tags.surface ?? null,
    hikingScale: tags.sac_scale ?? null,
    geometryKind:
      tags.area === "yes"
        ? "area"
        : tags.area === "no"
          ? "line"
          : tags.area !== undefined || tags.leisure === "track"
            ? "unknown"
            : "line",
  };
}

import { DOMParser, onErrorStopParsing } from "@xmldom/xmldom";
import type { Sample } from "./types";
import { routeLines } from "./geo";
import { coordinate } from "./route-planning";
import { AppFailure } from "../security/errors";
const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function exportGPX(name: string, points: Sample[], recorded = false) {
  if (points.length > 100000)
    throw new AppFailure("validation", "This route is too large to export.");
  const segments = routeLines(points)
    .map(
      (line) =>
        `<trkseg>${line.map((p) => `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">${p.altitude !== undefined && Number.isFinite(p.altitude) ? `<ele>${p.altitude.toFixed(1)}</ele>` : ""}${recorded && p.t > 0 ? `<time>${new Date(p.t).toISOString()}</time>` : ""}${recorded && p.hr ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : ""}</trkpt>`).join("")}</trkseg>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="RIVL" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>${escape(name)}</name>${segments}</trk></gpx>`;
}
export function importGPX(xml: string): { name: string; points: Sample[] } {
  if (xml.length > 4_000_000 || /<!\s*(DOCTYPE|ENTITY)\b/i.test(xml))
    throw new AppFailure(
      "validation",
      "Use a GPX file under 4 MB without document entities.",
    );
  let doc;
  try {
    doc = new DOMParser({ onError: onErrorStopParsing }).parseFromString(
      xml,
      "application/xml",
    );
  } catch {
    throw new AppFailure("validation", "This GPX file couldn’t be read.");
  }
  if (doc.documentElement?.localName !== "gpx")
    throw new AppFailure("validation", "Choose a GPX route file.");
  const points: Sample[] = [],
    segments = Array.from(doc.getElementsByTagNameNS("*", "trkseg"));
  const groups = segments.length
    ? segments
    : Array.from(doc.getElementsByTagNameNS("*", "rte"));
  for (const [segment, group] of groups.entries())
    for (const node of Array.from(
      group.getElementsByTagNameNS("*", segments.length ? "trkpt" : "rtept"),
    )) {
      if (points.length >= 100000)
        throw new AppFailure(
          "validation",
          "This GPX file contains too many points.",
        );
      const lat = node.getAttribute("lat"),
        lng = node.getAttribute("lon");
      if (!lat || !lng)
        throw new AppFailure(
          "validation",
          "A GPX point is missing coordinates.",
        );
      const p = coordinate({ lat: Number(lat), lng: Number(lng) }),
        altitude = Number(
          node.getElementsByTagNameNS("*", "ele")[0]?.textContent,
        ),
        hasAlt = !!node.getElementsByTagNameNS("*", "ele").length;
      points.push({
        ...p,
        t: points.length,
        accuracy: 0,
        segment,
        ...(hasAlt &&
        Number.isFinite(altitude) &&
        altitude >= -500 &&
        altitude <= 10000
          ? { altitude }
          : {}),
      });
    }
  if (points.length < 2)
    throw new AppFailure("validation", "This GPX file has no usable route.");
  return {
    name:
      (
        doc.getElementsByTagNameNS("*", "name")[0]?.textContent ??
        "Imported route"
      )
        .trim()
        .slice(0, 100) || "Imported route",
    points,
  };
}

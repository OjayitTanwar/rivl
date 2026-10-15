import { it, expect } from "vitest";
import { exportGPX, importGPX } from "../src/domain/gpx";
const points = [
  { lat: 51, lng: 0, t: 100000, accuracy: 0, segment: 0, hr: 150 },
  { lat: 51.001, lng: 0.001, t: 101000, accuracy: 0, segment: 0 },
  { lat: 51.002, lng: 0.002, t: 105000, accuracy: 0, segment: 1 },
];
it("round-trips escaped route names and preserves GPX segment gaps", () => {
  const result = importGPX(exportGPX("Ride & <home>", points));
  expect(result.name).toBe("Ride & <home>");
  expect(result.points.map((p) => p.segment)).toEqual([0, 0, 1]);
  expect(exportGPX("route", points)).not.toContain("<time>");
  expect(exportGPX("activity", points, true)).toContain(
    "<gpxtpx:hr>150</gpxtpx:hr>",
  );
});
it("rejects entities, oversized files, invalid coordinates and non-GPX files", () => {
  for (const xml of [
    '<!DOCTYPE gpx [<!ENTITY x "private">]><gpx/>',
    "<gpx><trk><trkseg><trkpt lat='999' lon='0'/></trkseg></trk></gpx>",
    "<html/>",
    "x".repeat(4000001),
  ])
    expect(() => importGPX(xml)).toThrow();
});

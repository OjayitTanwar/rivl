import type { Coordinate, Sample, PrivacyZone } from "./types";
const rad = Math.PI / 180;
export function distance(a: Coordinate, b: Coordinate): number {
  const p = (b.lat - a.lat) * rad,
    q = (b.lng - a.lng) * rad,
    h =
      Math.sin(p / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(q / 2) ** 2;
  return (
    6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function validSample(p: Sample): boolean {
  return (
    [p.lat, p.lng, p.t, p.accuracy].every(Number.isFinite) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    p.accuracy >= 0 &&
    p.accuracy <= 50
  );
}
function perpendicular(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const x = (p.lng - a.lng) * Math.cos(a.lat * rad),
    y = p.lat - a.lat,
    dx = (b.lng - a.lng) * Math.cos(a.lat * rad),
    dy = b.lat - a.lat,
    k = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - k * dx, y - k * dy) * 111195;
}
// Iterative Douglas–Peucker prevents recursion overflow on long tracks.
export function simplify<T extends Coordinate>(
  points: T[],
  tolerance = 8,
): T[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]),
    stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = tolerance,
      idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpendicular(points[i]!, points[a]!, points[b]!);
      if (d > far) {
        far = d;
        idx = i;
      }
    }
    if (idx >= 0) {
      keep.add(idx);
      stack.push([a, idx], [idx, b]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]!);
}
export function routeLines(points: Sample[]): Sample[][] {
  const lines: Sample[][] = [];
  for (const p of points) {
    const last = lines[lines.length - 1];
    if (!last || last[last.length - 1]!.segment !== p.segment) lines.push([p]);
    else last.push(p);
  }
  return lines;
}
// Privacy holes become separate lines. Never reconnect across a hidden location.
export function redactRoute(
  points: Sample[],
  zones: PrivacyZone[],
  endpointRadius = 200,
): Sample[][] {
  if (!points.length) return [];
  const protectedZones = [
    ...zones,
    { ...points[0]!, radius: endpointRadius },
    { ...points[points.length - 1]!, radius: endpointRadius },
  ];
  const lines: Sample[][] = [];
  let current: Sample[] = [];
  for (const p of points) {
    const previous = current[current.length - 1];
    const hidden = protectedZones.some((z) => distance(p, z) < z.radius);
    const crossesZone =
      previous &&
      previous.segment === p.segment &&
      protectedZones.some(
        (z) =>
          z.radius > 0 && perpendicular(z, previous, p) <= z.radius * 1.01 + 2,
      );
    if (
      hidden ||
      crossesZone ||
      (current.length && current[current.length - 1]!.segment !== p.segment)
    ) {
      if (current.length > 1) lines.push(current);
      current = [];
    }
    if (!hidden) current.push(p);
  }
  if (current.length > 1) lines.push(current);
  return lines;
}
export function encodeSamples(samples: Sample[]): number[][] {
  let lat = 0,
    lng = 0,
    t = 0;
  return samples.map((p) => {
    const a = Math.round(p.lat * 1e7),
      b = Math.round(p.lng * 1e7),
      c = p.t,
      row = [
        a - lat,
        b - lng,
        c - t,
        Math.round((p.altitude ?? -9999) * 10),
        Math.round(p.accuracy * 10),
        p.hr ?? -1,
        p.watts ?? -1,
        p.segment,
      ];
    lat = a;
    lng = b;
    t = c;
    return row;
  });
}
export function decodeSamples(rows: number[][]): Sample[] {
  let lat = 0,
    lng = 0,
    t = 0;
  return rows.map((r) => {
    lat += r[0]!;
    lng += r[1]!;
    t += r[2]!;
    return {
      lat: lat / 1e7,
      lng: lng / 1e7,
      t,
      altitude: r[3] === -99990 ? undefined : r[3]! / 10,
      accuracy: r[4]! / 10,
      hr: r[5] === -1 ? undefined : r[5],
      watts: r[6] === -1 ? undefined : r[6],
      segment: r[7]!,
    };
  });
}

// Preserve regular real fixes as well as turns, so endpoint redaction does not
// erase a straight workout whose simplified route contains only two points.
export function publicationPoints(samples: Sample[], tolerance = 8): Sample[] {
  return routeLines(samples).flatMap((line) => {
    const turns = new Set(simplify(line, tolerance).map((p) => p.t));
    let last: Sample | null = null;
    return line.filter((p, i) => {
      const keep =
        !last ||
        i === line.length - 1 ||
        turns.has(p.t) ||
        distance(last, p) >= 75;
      if (keep) last = p;
      return keep;
    });
  });
}

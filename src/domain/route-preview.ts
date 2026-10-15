import type { Sample } from "./types";

export function routePreviewPath(
  points: readonly Sample[],
  width = 320,
  height = 180,
  limit = 256,
): string {
  if (!points.length) return "";
  const budget = Math.max(2, Math.min(1024, Math.floor(limit) || 256));
  const stride = Math.max(1, Math.ceil((points.length - 1) / (budget - 1)));
  const chosen: { x: number; y: number; move: boolean }[] = [];
  let previous: Sample | undefined,
    longitude = 0,
    broken = true;
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    if (
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      Math.abs(point.lat) > 90 ||
      Math.abs(point.lng) > 180
    ) {
      previous = undefined;
      broken = true;
      continue;
    }
    if (!previous) longitude = point.lng;
    else longitude += ((point.lng - previous.lng + 540) % 360) - 180;
    if (!previous || point.segment !== previous.segment) broken = true;
    if (i % stride === 0 || i === points.length - 1) {
      const latitude = (Math.max(-85, Math.min(85, point.lat)) * Math.PI) / 180;
      chosen.push({
        x: (longitude * Math.PI) / 180,
        y: -Math.log(Math.tan(Math.PI / 4 + latitude / 2)),
        move: broken,
      });
      broken = false;
    }
    previous = point;
  }
  if (!chosen.length) return "";
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of chosen) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const scale = Math.min(
    (width - 32) / (maxX - minX || 1e-9),
    (height - 32) / (maxY - minY || 1e-9),
  );
  const x = (width - (maxX - minX) * scale) / 2;
  const y = (height - (maxY - minY) * scale) / 2;
  return chosen
    .map(
      (p) =>
        `${p.move ? "M" : "L"}${(x + (p.x - minX) * scale).toFixed(2)},${(y + (p.y - minY) * scale).toFixed(2)}`,
    )
    .join(" ");
}

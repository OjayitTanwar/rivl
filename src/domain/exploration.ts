import type { Activity, Sample } from "./types";
import { distance } from "./geo";

const DAY = 86400000;
export const TILE_METERS = 150;
export interface ExplorationTile {
  id: string;
  lat: number;
  lng: number;
  visits: number;
}
const dayKey = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
function tile(point: Sample): ExplorationTile {
  const y = Math.floor((point.lat * 111195) / TILE_METERS);
  const lat = ((y + 0.5) * TILE_METERS) / 111195;
  const scale = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const x = Math.floor((point.lng * 111195 * scale) / TILE_METERS);
  return {
    id: `${y}:${x}`,
    lat,
    lng: ((x + 0.5) * TILE_METERS) / (111195 * scale),
    visits: 1,
  };
}
export function exploredTiles(routes: Sample[][]): ExplorationTile[] {
  const all = new Map<string, ExplorationTile>();
  for (const route of routes) {
    const visited = new Map<string, ExplorationTile>();
    for (let i = 0; i < route.length; i++) {
      const p = route[i]!;
      if (
        ![p.lat, p.lng].every(Number.isFinite) ||
        Math.abs(p.lat) > 85 ||
        Math.abs(p.lng) > 180 ||
        p.accuracy > 50
      )
        continue;
      const cell = tile(p);
      visited.set(cell.id, cell);
      const before = route[i - 1];
      // Never award the territory between separate GPS segments or a large gap.
      if (!before || before.segment !== p.segment || before.accuracy > 50)
        continue;
      const meters = distance(before, p);
      if (meters > 1500) continue;
      const count = Math.min(50, Math.ceil(meters / 40));
      for (let n = 1; n < count; n++) {
        const deltaLng = ((p.lng - before.lng + 540) % 360) - 180;
        const lng = ((before.lng + (deltaLng * n) / count + 540) % 360) - 180;
        const c = tile({
          ...p,
          lat: before.lat + ((p.lat - before.lat) * n) / count,
          lng,
        });
        visited.set(c.id, c);
      }
    }
    for (const c of visited.values()) {
      const old = all.get(c.id);
      if (!old && all.size >= 30000) continue;
      all.set(c.id, { ...c, visits: (old?.visits ?? 0) + 1 });
      if (all.size >= 30000) break;
    }
  }
  return [...all.values()];
}
export const EXPLORATION_REWARDS = [
  {
    tiles: 0,
    title: "First steps",
    detail: "Signal story style",
    style: "signal",
  },
  {
    tiles: 10,
    title: "Neighbourhood scout",
    detail: "Explorer badge",
    style: null,
  },
  {
    tiles: 40,
    title: "Trail finder",
    detail: "Terrain story style",
    style: "terrain",
  },
  {
    tiles: 120,
    title: "City explorer",
    detail: "Night story style",
    style: "night",
  },
  {
    tiles: 300,
    title: "Beyond the familiar",
    detail: "Expedition badge",
    style: null,
  },
] as const;
export function explorationProgress(activities: Activity[], now = Date.now()) {
  const real = activities.filter(
    (a) => !a.demo && !a.simulated && a.startedAt <= now,
  );
  const tiles = exploredTiles(real.map((a) => a.route));
  const days = new Set(real.map((a) => dayKey(a.startedAt)));
  let streak = 0;
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(today.getTime()))) today.setDate(today.getDate() - 1);
  for (let i = 0; i < 3660 && days.has(dayKey(today.getTime())); i++) {
    streak++;
    today.setDate(today.getDate() - 1);
  }
  const weekly = real.filter((a) => a.startedAt >= now - 7 * DAY);
  const previous = new Set(
    exploredTiles(
      real.filter((a) => a.startedAt < now - 7 * DAY).map((a) => a.route),
    ).map((t) => t.id),
  );
  const newTiles = tiles.filter((t) => !previous.has(t.id)).length;
  const xp =
    tiles.length * 10 +
    real.length * 20 +
    real.reduce(
      (s, a) => s + Math.min(100, Math.floor(a.summary.ascent / 10)),
      0,
    );
  const level = 1 + Math.floor(Math.sqrt(xp / 100));
  const floor = (level - 1) ** 2 * 100;
  const nextXP = level ** 2 * 100;
  return {
    tiles,
    xp,
    level,
    streak,
    nextXP,
    levelProgress: (xp - floor) / (nextXP - floor),
    missions: [
      {
        title: "Take a new turn",
        value: newTiles,
        target: 5,
        unit: "new tiles",
      },
      {
        title: "Keep showing up",
        value: new Set(weekly.map((a) => dayKey(a.startedAt))).size,
        target: 3,
        unit: "active days",
      },
      {
        title: "Find higher ground",
        value: Math.floor(weekly.reduce((s, a) => s + a.summary.ascent, 0)),
        target: 100,
        unit: "metres climbed",
      },
    ],
    rewards: EXPLORATION_REWARDS.map((r) => ({
      ...r,
      unlocked: tiles.length >= r.tiles,
    })),
  };
}
export function tileFeatures(tiles: ExplorationTile[]) {
  return {
    type: "FeatureCollection" as const,
    features: tiles.map((t) => {
      const dy = TILE_METERS / 111195 / 2;
      const dx = dy / Math.max(0.1, Math.cos((t.lat * Math.PI) / 180));
      return {
        type: "Feature" as const,
        properties: { visits: t.visits },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [t.lng - dx, t.lat - dy],
              [t.lng + dx, t.lat - dy],
              [t.lng + dx, t.lat + dy],
              [t.lng - dx, t.lat + dy],
              [t.lng - dx, t.lat - dy],
            ],
          ],
        },
      };
    }),
  };
}

import type { Coordinate, Sample } from "./types";
import type { GuidedRoute, NavigationStep } from "./navigation";
import { distance } from "./geo";

type Edge = { to: number; meters: number };
type QueueItem = { node: number; score: number };

function push(queue: QueueItem[], item: QueueItem) {
  let index = queue.length;
  queue.push(item);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    if (queue[parent]!.score <= item.score) break;
    queue[index] = queue[parent]!;
    index = parent;
  }
  queue[index] = item;
}

function pop(queue: QueueItem[]): QueueItem | undefined {
  const first = queue[0];
  const last = queue.pop();
  if (!first || !last || !queue.length) return first;
  let index = 0;
  while (index * 2 + 1 < queue.length) {
    let child = index * 2 + 1;
    if (
      child + 1 < queue.length &&
      queue[child + 1]!.score < queue[child]!.score
    )
      child++;
    if (last.score <= queue[child]!.score) break;
    queue[index] = queue[child]!;
    index = child;
  }
  queue[index] = last;
  return first;
}

function bearing(a: Coordinate, b: Coordinate) {
  const east = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2(east, b.lat - a.lat) * 180) / Math.PI;
}

// Route only over saved ways tagged for the selected activity mode. Different
// ways join at shared OSM coordinates; visual crossings do not create access.
export function offlineReroute(
  lines: Sample[][],
  start: Coordinate,
  finish: Coordinate,
): GuidedRoute | null {
  if (!lines.length) return null;
  const nodes: Coordinate[] = [];
  const edges: Edge[][] = [];
  const indices = new Map<string, number>();
  const nodeFor = (point: Coordinate) => {
    const key = `${Math.round(point.lat * 1e7)},${Math.round(point.lng * 1e7)}`;
    let index = indices.get(key);
    if (index === undefined) {
      index = nodes.length;
      nodes.push({ lat: point.lat, lng: point.lng });
      edges.push([]);
      indices.set(key, index);
    }
    return index;
  };
  for (const line of lines) {
    let previous = -1;
    for (const point of line) {
      const current = nodeFor(point);
      if (previous >= 0 && previous !== current) {
        const meters = distance(nodes[previous]!, nodes[current]!);
        if (meters > 0 && meters <= 250) {
          edges[previous]!.push({ to: current, meters });
          edges[current]!.push({ to: previous, meters });
        }
      }
      previous = current;
    }
  }
  if (nodes.length < 2 || nodes.length > 20000) return null;
  const closest = (point: Coordinate) => {
    let result = -1;
    let meters = 20;
    nodes.forEach((node, index) => {
      const gap = distance(point, node);
      if (gap < meters) {
        meters = gap;
        result = index;
      }
    });
    return result;
  };
  const origin = closest(start);
  const target = closest(finish);
  if (origin < 0 || target < 0 || origin === target) return null;
  const costs = new Float64Array(nodes.length).fill(Infinity);
  const parent = new Int32Array(nodes.length).fill(-1);
  const queue: QueueItem[] = [];
  costs[origin] = 0;
  push(queue, { node: origin, score: 0 });
  while (queue.length) {
    const current = pop(queue)!;
    if (current.score !== costs[current.node]) continue;
    if (current.node === target) break;
    for (const edge of edges[current.node]!) {
      const next = current.score + edge.meters;
      if (next >= costs[edge.to]!) continue;
      costs[edge.to] = next;
      parent[edge.to] = current.node;
      push(queue, { node: edge.to, score: next });
    }
  }
  if (!Number.isFinite(costs[target]) || costs[target]! > 10000) return null;
  const path: number[] = [];
  for (let at = target; at >= 0; at = parent[at]!) {
    path.push(at);
    if (at === origin) break;
    if (path.length > nodes.length) return null;
  }
  if (path.at(-1) !== origin) return null;
  path.reverse();
  const points: Sample[] = path.map((index) => ({
    ...nodes[index]!,
    t: 0,
    accuracy: 0,
    segment: 0,
  }));
  const steps: NavigationStep[] = [
    {
      location: points[0]!,
      distanceAlong: 0,
      instruction: "Follow the highlighted mapped path.",
      kind: "depart",
    },
  ];
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    along += distance(points[i - 1]!, points[i]!);
    if (i >= points.length - 1) continue;
    const turn =
      ((bearing(points[i - 1]!, points[i]!) -
        bearing(points[i]!, points[i + 1]!) +
        540) %
        360) -
      180;
    if (Math.abs(turn) >= 40)
      steps.push({
        location: points[i]!,
        distanceAlong: along,
        instruction: turn > 0 ? "Turn left on the mapped path." : "Turn right on the mapped path.",
        kind: "turn",
      });
  }
  steps.push({
    location: points.at(-1)!,
    distanceAlong: along,
    instruction: "You have arrived at your destination.",
    kind: "arrive",
  });
  return { points, distance: along, kind: "paths", provider: "osm", steps };
}

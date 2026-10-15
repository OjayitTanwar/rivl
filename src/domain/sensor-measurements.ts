/** Bluetooth SIG Heart Rate Measurement (2A37) and Cycling Power Measurement (2A63). */
export function heartRateMeasurement(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0]!;
  if (flags & 4 && !(flags & 2)) return null; // Contact supported but not detected.
  const hr =
    flags & 1
      ? bytes.length >= 3
        ? bytes[1]! + (bytes[2]! << 8)
        : NaN
      : bytes[1]!;
  return Number.isFinite(hr) && hr >= 30 && hr <= 240 ? hr : null;
}
export function cyclingPowerMeasurement(bytes: Uint8Array): number | null {
  if (bytes.length < 4) return null;
  const raw = bytes[2]! + (bytes[3]! << 8),
    watts = raw >= 32768 ? raw - 65536 : raw;
  return watts >= 0 && watts <= 5000 ? watts : null;
}
export class SensorReadings {
  private values = new Map<
    string,
    {
      owner: string;
      kind: "hr" | "watts";
      points: { t: number; value: number }[];
    }
  >();
  add(
    device: string,
    owner: string,
    kind: "hr" | "watts",
    value: number,
    t: number,
  ) {
    const old = this.values.get(device + kind);
    const points =
      old?.owner === owner ? old.points.filter((p) => p.t > t - 60000) : [];
    points.push({ t, value });
    this.values.set(device + kind, { owner, kind, points: points.slice(-120) });
  }
  disconnect(device: string) {
    for (const key of this.values.keys())
      if (key === device + "hr" || key === device + "watts")
        this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
  at(owner: string, t: number): { hr?: number; watts?: number } {
    const result: { hr?: number; watts?: number } = {},
      times: { hr?: number; watts?: number } = {};
    for (const sensor of this.values.values()) {
      if (sensor.owner !== owner) continue;
      const point = sensor.points.findLast((p) => p.t <= t && t - p.t <= 5000);
      if (point && point.t > (times[sensor.kind] ?? -Infinity)) {
        result[sensor.kind] = point.value;
        times[sensor.kind] = point.t;
      }
    }
    return result;
  }
}
export const sensorReadings = new SensorReadings();

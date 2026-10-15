export const km = (m: number, d = 1) => (m / 1000).toFixed(d);
export type SpeedUnit = "kmh" | "mph";
export const speedLabel = (unit: SpeedUnit = "kmh") =>
  unit === "mph" ? "mph" : "km/h";
export const speed = (metersPerSecond: number, unit: SpeedUnit = "kmh") =>
  Number.isFinite(metersPerSecond) && metersPerSecond >= 0
    ? (metersPerSecond * (unit === "mph" ? 2.236936292 : 3.6)).toFixed(1)
    : "—";
export function duration(s: number) {
  if (!Number.isFinite(s)) return "—";
  const n = Math.max(0, Math.round(s));
  return n >= 3600
    ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
export const pace = (s: number) => (s > 0 ? duration(s) : "—");
export function relative(t: number) {
  const days = Math.floor((Date.now() - t) / 86400000);
  return days === 0
    ? "Today"
    : days === 1
      ? "Yesterday"
      : new Date(t).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
}
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

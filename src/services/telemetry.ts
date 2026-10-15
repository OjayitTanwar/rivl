import { diagnostic } from "../security/diagnostics";
export interface Telemetry {
  capture(error: unknown, context?: Record<string, string | number>): void;
  timing(name: string, ms: number): void;
}
let adapter: Telemetry = {
  capture(error, context) {
    console.error(
      "[RIVL]",
      error instanceof Error ? error.message : "Unexpected error",
      context ?? {},
    );
  },
  timing(name, ms) {
    if (__DEV__ && ms > 32)
      console.warn("[RIVL performance]", name, Math.round(ms));
  },
};
export function configureTelemetry(next: Telemetry) {
  adapter = next;
}
export const capture = (
  error: unknown,
  context?: Record<string, string | number>,
) => {
  const safe = diagnostic(error, context);
  adapter.capture(safe.error, safe.tags);
};
export function profile<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    adapter.timing(name, performance.now() - start);
  }
}

import { failure } from "./errors";
const services = new Set([
  "background-location",
  "recording-write",
  "recording-recovery",
  "sync",
  "health",
  "watch",
]);
export function diagnostic(
  error: unknown,
  context?: Record<string, string | number>,
) {
  const classified = failure(error);
  return {
    error: new Error(`RIVL ${classified.kind} failure`),
    tags: {
      kind: classified.kind,
      service:
        typeof context?.service === "string" && services.has(context.service)
          ? context.service
          : "application",
    },
  };
}

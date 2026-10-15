import * as Sentry from "@sentry/react-native";
import { config } from "./config";
import { configureTelemetry } from "./telemetry";
export function initializeCrashReporting() {
  if (!config.sentryDsn) return;
  try {
    Sentry.init({
      dsn: config.sentryDsn,
      sendDefaultPii: false,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
      beforeSend(event) {
        delete event.user;
        delete event.request;
        delete event.extra;
        delete event.contexts;
        delete event.message;
        event.breadcrumbs = [];
        event.tags = { failure: "runtime" };
        for (const exception of event.exception?.values ?? []) {
          exception.value = "RIVL runtime failure";
          exception.type = [
            "Error",
            "TypeError",
            "RangeError",
            "ReferenceError",
            "SyntaxError",
          ].includes(exception.type ?? "")
            ? exception.type
            : "Error";
          delete exception.mechanism;
          if (exception.stacktrace?.frames) {
            exception.stacktrace.frames = exception.stacktrace.frames.map(
              (frame) => ({
                function: frame.function,
                module: frame.module,
                lineno: frame.lineno,
                colno: frame.colno,
                in_app: frame.in_app,
              }),
            );
          }
        }
        return event;
      },
    });
  } catch {
    console.warn("[RIVL] Crash reporting could not initialize.");
    return;
  }
  configureTelemetry({
    capture(error, context) {
      Sentry.captureException(error, { tags: context });
    },
    timing(name, ms) {
      Sentry.addBreadcrumb({
        category: "performance",
        message: name,
        data: { durationMs: ms },
        level: "info",
      });
    },
  });
}

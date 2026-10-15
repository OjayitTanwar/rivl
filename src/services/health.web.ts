import type { HealthProvider } from "./health-types";
export type { HealthSnapshot } from "./health-types";
export { recoveryInsight } from "./health-types";
export const health: HealthProvider = {
  async connect() {
    throw new Error(
      "Connect HealthKit or Health Connect in the native iOS or Android app.",
    );
  },
  async refresh() {
    throw new Error(
      "Health data is available in the native iOS or Android app.",
    );
  },
  async heartRate() {
    return [];
  },
  async sleepHistory() {
    throw new Error(
      "Sleep history is available in the native iOS or Android app.",
    );
  },
};

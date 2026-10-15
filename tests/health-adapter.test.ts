import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  platform: { OS: "ios" },
  hk: {
    isHealthDataAvailable: vi.fn(() => true),
    requestAuthorization: vi.fn(async () => undefined),
    queryQuantitySamples: vi.fn(async () => []),
    queryStatisticsForQuantity: vi.fn(async () => null),
    queryCategorySamples: vi.fn(async () => []),
  },
  hc: {
    initialize: vi.fn(async () => true),
    requestPermission: vi.fn(async () => []),
    getGrantedPermissions: vi.fn(
      async () => [] as { recordType: string; accessType: "read" | "write" }[],
    ),
    readRecords: vi.fn(
      async () =>
        ({ records: [] }) as { records: unknown[]; pageToken?: string },
    ),
    aggregateRecord: vi.fn(async () => null),
  },
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("@kingstinct/react-native-healthkit", () => mocks.hk);
vi.mock("react-native-health-connect", () => mocks.hc);
import { health } from "../src/services/health";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform.OS = "ios";
  mocks.hk.queryCategorySamples.mockResolvedValue([]);
  mocks.hc.getGrantedPermissions.mockResolvedValue([]);
  mocks.hc.readRecords.mockResolvedValue({ records: [] });
});
it("requests health permissions explicitly on connect, never during automatic iOS refresh", async () => {
  await health.connect();
  expect(mocks.hk.requestAuthorization).toHaveBeenCalledTimes(1);
  expect(mocks.hk.requestAuthorization).toHaveBeenCalledWith(
    expect.objectContaining({
      toRead: expect.arrayContaining(["HKQuantityTypeIdentifierDietaryWater"]),
    }),
  );
  await health.refresh();
  expect(mocks.hk.requestAuthorization).toHaveBeenCalledTimes(1);
});
it("does not turn capped HealthKit sleep samples into a partial sleep total", async () => {
  mocks.hk.queryCategorySamples.mockResolvedValue(
    Array.from({ length: 2000 }, () => ({
      value: 1,
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(),
    })) as never[],
  );
  expect((await health.refresh()).sleepHours).toBeNull();
});
it("checks granted Android permissions without requesting them on refresh", async () => {
  mocks.platform.OS = "android";
  mocks.hc.getGrantedPermissions.mockResolvedValue([
    { recordType: "Hydration", accessType: "write" },
  ]);
  await health.refresh();
  expect(mocks.hc.getGrantedPermissions).toHaveBeenCalledTimes(1);
  expect(mocks.hc.requestPermission).not.toHaveBeenCalled();
  expect(mocks.hc.readRecords).not.toHaveBeenCalled();
});
it("does not publish incomplete Android sleep or hydration page totals", async () => {
  mocks.platform.OS = "android";
  mocks.hc.getGrantedPermissions.mockResolvedValue([
    { recordType: "SleepSession", accessType: "read" },
    { recordType: "Hydration", accessType: "read" },
  ]);
  mocks.hc.readRecords.mockResolvedValue({ records: [], pageToken: "next" });
  const snapshot = await health.refresh();
  expect(snapshot.sleepHours).toBeNull();
  expect(snapshot.waterComplete).toBe(false);
  expect(mocks.hc.requestPermission).not.toHaveBeenCalled();
});

import { describe, it, expect, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({
  os: "ios",
  statistics: vi.fn(),
  quantity: vi.fn(),
  authorization: vi.fn(),
  permissions: vi.fn(),
  aggregate: vi.fn(),
  request: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.os;
    },
  },
}));
vi.mock("@kingstinct/react-native-healthkit", () => ({
  isHealthDataAvailable: () => true,
  requestAuthorization: mock.authorization,
  queryQuantitySamples: mock.quantity,
  queryCategorySamples: async () => [],
  queryStatisticsForQuantity: mock.statistics,
}));
vi.mock("react-native-health-connect", () => ({
  initialize: async () => true,
  getGrantedPermissions: mock.permissions,
  requestPermission: mock.request,
  readRecords: async () => ({ records: [] }),
  aggregateRecord: mock.aggregate,
}));
import { health } from "../src/services/health";
import { wellnessUnit } from "../src/domain/wellness";
beforeEach(() => {
  vi.clearAllMocks();
  mock.os = "ios";
  mock.quantity.mockResolvedValue([]);
  mock.statistics.mockResolvedValue({});
  mock.aggregate.mockResolvedValue({ dataOrigins: [] });
  mock.permissions.mockResolvedValue([]);
});
describe("genuine daily movement adapters", () => {
  it("requests Apple count/kcal aggregates for the exact local-day interval", async () => {
    mock.statistics.mockImplementation(async (type: string) =>
      type.endsWith("FlightsClimbed")
        ? { sumQuantity: { quantity: 3 } }
        : type.endsWith("ActiveEnergyBurned")
          ? { sumQuantity: { quantity: 245.5 } }
          : {},
    );
    const data = await health.refresh();
    expect(data.floorsClimbed).toBe(3);
    expect(data.activeEnergyKcal).toBe(245.5);
    const day = new Date(data.readAt);
    day.setHours(0, 0, 0, 0);
    expect(data.movementStartedAt).toBe(day.getTime());
    const call = mock.statistics.mock.calls.find((c) =>
      c[0].endsWith("ActiveEnergyBurned"),
    );
    expect(call?.[2]?.unit).toBe("kcal");
    expect(mock.authorization).not.toHaveBeenCalled();
  });
  it("keeps missing and failed native aggregates unknown", async () => {
    mock.statistics.mockImplementation(async (type: string) => {
      if (type.endsWith("ActiveEnergyBurned")) throw Error("denied");
      return {};
    });
    const data = await health.refresh();
    expect(data.floorsClimbed).toBeNull();
    expect(data.activeEnergyKcal).toBeNull();
  });
  it("reads authorized Health Connect floors and active kcal, preserving fractional quantities", async () => {
    mock.os = "android";
    mock.permissions.mockResolvedValue([
      { accessType: "read", recordType: "FloorsClimbed" },
      { accessType: "read", recordType: "ActiveCaloriesBurned" },
    ]);
    mock.aggregate.mockImplementation(async (o) =>
      o.recordType === "FloorsClimbed"
        ? { dataOrigins: ["watch.app"], FLOORS_CLIMBED_TOTAL: 3.25 }
        : {
            dataOrigins: ["watch.app"],
            ACTIVE_CALORIES_TOTAL: { inKilocalories: 123.5 },
          },
    );
    const data = await health.refresh();
    expect(data.floorsClimbed).toBe(3.25);
    expect(data.activeEnergyKcal).toBe(123.5);
    expect(mock.request).not.toHaveBeenCalled();
  });
  it("does not synthesize zero from absent origins or ungranted Android permissions", async () => {
    mock.os = "android";
    let data = await health.refresh();
    expect(mock.aggregate).not.toHaveBeenCalled();
    expect(data.floorsClimbed).toBeNull();
    mock.permissions.mockResolvedValue([
      { accessType: "read", recordType: "FloorsClimbed" },
    ]);
    mock.aggregate.mockResolvedValue({
      dataOrigins: [],
      FLOORS_CLIMBED_TOTAL: 0,
    });
    data = await health.refresh();
    expect(data.floorsClimbed).toBeNull();
  });
  it("offers new categories only through explicit connection permissions and preserves provider units", async () => {
    await health.connect();
    expect(mock.authorization.mock.calls[0]?.[0]?.toRead).toContain(
      "HKQuantityTypeIdentifierFlightsClimbed",
    );
    expect(mock.authorization.mock.calls[0]?.[0]?.toRead).toContain(
      "HKQuantityTypeIdentifierActiveEnergyBurned",
    );
    expect(
      wellnessUnit({
        kind: "floorsClimbed",
        source: { provider: "HealthKit", recordId: "x", readAt: 1 },
      }),
    ).toBe("flights");
    expect(
      wellnessUnit({
        kind: "floorsClimbed",
        source: { provider: "Health Connect", recordId: "x", readAt: 1 },
      }),
    ).toBe("floors");
    expect(wellnessUnit({ kind: "activeEnergy" })).toBe("kcal");
  });
});

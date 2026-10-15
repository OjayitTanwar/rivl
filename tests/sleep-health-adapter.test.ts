import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  os: "ios",
  query: vi.fn(),
  initialize: vi.fn(),
  permissions: vi.fn(),
  records: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.os;
    },
  },
}));
vi.mock("@kingstinct/react-native-healthkit", () => ({
  isHealthDataAvailable: () => true,
  queryCategorySamples: mocks.query,
}));
vi.mock("react-native-health-connect", () => ({
  initialize: mocks.initialize,
  getGrantedPermissions: mocks.permissions,
  readRecords: mocks.records,
}));
import { health } from "../src/services/health";
const now = Date.now(),
  start = now - 86400000;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.os = "ios";
  mocks.initialize.mockResolvedValue(true);
  mocks.permissions.mockResolvedValue([
    { accessType: "read", recordType: "SleepSession" },
  ]);
});
describe("connected sleep provider reads", () => {
  it("preserves Apple actual stages and provider provenance without requesting permissions", async () => {
    mocks.query.mockResolvedValue([
      {
        uuid: "a",
        startDate: new Date(start),
        endDate: new Date(start + 3600000),
        value: 3,
        sourceRevision: { source: { name: "Real watch" } },
      },
    ]);
    const r = await health.sleepHistory!(7);
    expect(r.intervals[0]).toMatchObject({
      id: "a",
      stage: "core",
      sourceName: "Real watch",
    });
    expect(mocks.query.mock.calls[0]?.[1]?.limit).toBe(5001);
  });
  it("rejects capped Apple reads rather than presenting partial history", async () => {
    mocks.query.mockResolvedValue(Array(5001).fill({}));
    await expect(health.sleepHistory!(30)).rejects.toThrow("Too many");
  });
  it("paginates Health Connect and keeps unknown session gaps separate from actual stages", async () => {
    mocks.os = "android";
    mocks.records
      .mockResolvedValueOnce({
        records: [
          {
            metadata: { id: "s", dataOrigin: "watch.app" },
            startTime: new Date(start).toISOString(),
            endTime: new Date(start + 2 * 3600000).toISOString(),
            stages: [
              {
                stage: 6,
                startTime: new Date(start).toISOString(),
                endTime: new Date(start + 3600000).toISOString(),
              },
            ],
          },
        ],
        pageToken: "next",
      })
      .mockResolvedValueOnce({ records: [] });
    const r = await health.sleepHistory!(7);
    expect(r.intervals.map((i) => i.stage)).toEqual(["unknown", "rem"]);
    expect(mocks.records.mock.calls[1]?.[1]?.pageToken).toBe("next");
  });
  it("rejects repeated pagination and stages outside their actual session", async () => {
    mocks.os = "android";
    mocks.records.mockResolvedValue({ records: [], pageToken: "same" });
    await expect(health.sleepHistory!(7)).rejects.toThrow("did not finish");
    mocks.records.mockResolvedValueOnce({
      records: [
        {
          metadata: { id: "s" },
          startTime: new Date(start).toISOString(),
          endTime: new Date(start + 3600000).toISOString(),
          stages: [
            {
              stage: 5,
              startTime: new Date(start - 1).toISOString(),
              endTime: new Date(start + 1).toISOString(),
            },
          ],
        },
      ],
    });
    await expect(health.sleepHistory!(7)).rejects.toThrow("outside");
  });
  it("refuses disconnected Android permission without requesting it again", async () => {
    mocks.os = "android";
    mocks.permissions.mockResolvedValue([]);
    await expect(health.sleepHistory!(7)).rejects.toThrow("Allow sleep access");
    expect(mocks.records).not.toHaveBeenCalled();
  });
});

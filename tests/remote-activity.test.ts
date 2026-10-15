import { expect, it } from "vitest";
import {
  decodeRemoteActivity,
  remoteTimestamp,
} from "../src/domain/remote-activity";
import { processActivity } from "../src/domain/processing";

const row = () => ({
  id: "activity-1",
  owner_id: "owner-1",
  title: "Recorded run",
  sport: "run",
  started_at: "2026-10-07T10:00:00.000Z",
  ended_at: "2026-10-07T10:30:00.000Z",
  updated_at: "2026-10-07T11:00:00.000Z",
  visibility: "private",
  note: "",
  rpe: 5,
  revision: 1,
  summary: {
    ...processActivity([], "run", 0, 1800000),
    distance: 5234.78,
    avgHR: 151.2,
    maxHR: 177,
    hrZoneMaxHR: 190,
    hrZoneThresholds: [110, 130, 150, 175],
  },
  display_route: [
    {
      lat: 12.3,
      lng: 45.6,
      t: Date.parse("2026-10-07T10:01:00.000Z"),
      accuracy: 5,
      segment: 0,
    },
  ],
  photo_keys: ["owner-1/activity-1/photo.jpg"],
});
it("preserves recorded metrics and personal zone context without recomputing", () => {
  const input = row();
  const decoded = decodeRemoteActivity(input, "owner-1");
  expect(decoded.activity.summary).toEqual(input.summary);
  expect(decoded.activity.route).toEqual(input.display_route);
  expect(decoded.activity.photoKeys).toEqual(input.photo_keys);
});
it.each([
  { owner_id: "someone-else" },
  { id: "x),id.gt.other" },
  { sport: "swim" },
  { visibility: "unknown" },
  { ended_at: "2026-10-06T10:00:00.000Z" },
  { updated_at: "bad" },
  { revision: 1.5 },
  { rpe: 11 },
  { photo_keys: ["other/activity-1/photo.jpg"] },
  { photo_keys: ["owner-1/activity-1/../photo.jpg"] },
  { photo_keys: ["owner-1/activity-1/%2e%2e.jpg"] },
  { display_route: [{ lat: 91, lng: 2, t: 0, accuracy: 1, segment: 0 }] },
  { display_route: Array(12001).fill({}) },
])("rejects untrusted metadata and media paths: %j", (patch) => {
  expect(() =>
    decodeRemoteActivity({ ...row(), ...patch }, "owner-1"),
  ).toThrow();
});
it.each(["distance", "avgHR", "zones", "splits", "bests", "loadMethod"])(
  "does not fabricate missing %s",
  (key) => {
    const input = row();
    delete (input.summary as Record<string, unknown>)[key];
    expect(() => decodeRemoteActivity(input, "owner-1")).toThrow();
  },
);
it("rejects nonfinite measurements and invalid stored zone boundaries", () => {
  const input = row();
  input.summary.distance = NaN;
  expect(() => decodeRemoteActivity(input, "owner-1")).toThrow();
  input.summary.distance = 123;
  input.summary.hrZoneThresholds = [110, 130, 150, 200];
  expect(() => decodeRemoteActivity(input, "owner-1")).toThrow();
});
it("accepts legacy summaries without optional HR context", () => {
  const input = row();
  input.summary = processActivity(
    [],
    "run",
    0,
    1800000,
  ) as typeof input.summary;
  delete (input.summary as Record<string, unknown>).hrZoneMaxHR;
  delete (input.summary as Record<string, unknown>).hrZoneThresholds;
  expect(
    decodeRemoteActivity(input, "owner-1").activity.summary.hrZoneMaxHR,
  ).toBeUndefined();
});
it.each([null, "2026-10-07", "2026-02-30T10:00:00Z", "yesterday", Infinity])(
  "rejects invalid server clocks %j",
  (value) => {
    expect(() => remoteTimestamp(value)).toThrow();
  },
);

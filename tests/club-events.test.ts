import { describe, it, expect } from "vitest";
import { clubEventInput, decodeClubDetail } from "../src/domain/club-events";
const now = Date.parse("2026-10-16T00:00:00Z");
const base = {
  title: "Morning ride",
  meetingPoint: "Park gate",
  start: "2026-10-20T06:00+05:30",
  timeZone: "Asia/Kolkata",
  duration: "60",
  capacity: "20",
};
describe("club event input", () => {
  it("converts explicit offset to UTC and preserves the event timezone", () => {
    const parsed = clubEventInput(base, now);
    expect(parsed.p_start).toBe("2026-10-20T00:30:00.000Z");
    expect(parsed.p_time_zone).toBe("Asia/Kolkata");
  });
  it("rejects nonexistent calendar dates and missing offsets", () => {
    for (const start of [
      "2026-10-20T06:00",
      "2027-02-30T06:00+05:30",
      "2026-10-20T25:00+05:30",
    ])
      expect(() => clubEventInput({ ...base, start }, now)).toThrow();
  });
  it("validates daylight saving offset for the selected date", () => {
    expect(() =>
      clubEventInput(
        { ...base, start: "2026-10-20T06:00+00:00", timeZone: "Europe/London" },
        now,
      ),
    ).toThrow();
    expect(
      clubEventInput(
        { ...base, start: "2026-11-20T06:00+00:00", timeZone: "Europe/London" },
        now,
      ).p_start,
    ).toContain("06:00:00");
  });
  it("rejects past starts, invalid zones and fractional or oversized capacity", () => {
    for (const input of [
      { start: "2026-10-15T06:00+05:30" },
      { timeZone: "fake-zone" },
      { capacity: "1.5" },
      { capacity: "501" },
      { duration: "0" },
    ])
      expect(() => clubEventInput({ ...base, ...input }, now)).toThrow();
  });
  it("refuses malformed club payloads instead of inventing roles or members", () => {
    expect(() =>
      decodeClubDetail({ id: "bad", members: [], events: [] }),
    ).toThrow();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/services/supabase", () => ({ supabase: { rpc } }));
import { segmentStandings } from "../src/services/segment-history";
import { ownerMatchesGender } from "../src/domain/segment-history";
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});
describe("consented gender standings adapter", () => {
  it("preserves the legacy eight-argument request for other scopes", async () => {
    await segmentStandings("hill", "overall");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_gender");
    expect(Object.keys(rpc.mock.calls[0]?.[1])).toHaveLength(8);
  });
  it("sends explicit category with date bounds and frequent mode", async () => {
    await segmentStandings("hill", "gender", {
      gender: "nonbinary",
      since: 0,
      until: 86400000,
      frequent: true,
    });
    expect(rpc).toHaveBeenCalledWith(
      "segment_standings",
      expect.objectContaining({
        p_gender: "nonbinary",
        p_scope: "gender",
        p_since: "1970-01-01T00:00:00.000Z",
        p_until: "1970-01-02T00:00:00.000Z",
        p_frequent: true,
      }),
    );
  });
  it("rejects missing or unknown category before requesting private data", async () => {
    await expect(segmentStandings("hill", "gender")).rejects.toThrow(
      "Choose a gender category",
    );
    await expect(
      segmentStandings("hill", "gender", { gender: "inferred" as never }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns checked rows only for valid server results", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          athlete_id: "a",
          athlete: "A",
          seconds: 100,
          date: "2026-10-01T00:00:00Z",
          effort_count: 2,
        },
        {
          athlete_id: "b",
          athlete: "B",
          seconds: -1,
          date: "bad",
          effort_count: 0,
        },
      ],
      error: null,
    });
    expect(
      await segmentStandings("hill", "gender", { gender: "women" }),
    ).toEqual([
      {
        athleteId: "a",
        athlete: "A",
        seconds: 100,
        date: Date.parse("2026-10-01T00:00:00Z"),
        count: 2,
        checked: true,
      },
    ]);
  });
  it("filters local owner using only a current explicit matching category", () => {
    expect(ownerMatchesGender(null, "women")).toBe(false);
    expect(ownerMatchesGender(undefined, "men")).toBe(false);
    expect(ownerMatchesGender("women", "men")).toBe(false);
    expect(ownerMatchesGender("nonbinary", "nonbinary")).toBe(true);
  });
  it("surfaces server failures without inventing standings", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(
      segmentStandings("hill", "gender", { gender: "men" }),
    ).rejects.toThrow("Segment history");
  });
});

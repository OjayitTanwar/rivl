import { describe, expect, it } from "vitest";
import { reconstructUnmappedTracks as reconstruct } from "../src/domain/unmapped-track-reconstruction";
import type { ReconstructionObservation } from "../src/domain/track-reconstruction";
const M = 111195;
function observation(
  i: number,
  options: {
    offset?: number;
    start?: number;
    end?: number;
    step?: number;
    reverse?: boolean;
    day?: string;
  } = {},
): ReconstructionObservation {
  const {
    offset = i * 0.4,
    start = 0,
    end = 300,
    step = 10,
    reverse = false,
    day = `2026-10-${10 + (i % 3)}`,
  } = options;
  const line = Array.from(
    { length: Math.floor((end - start) / step) + 1 },
    (_, j) => ({ lat: offset / M, lng: (start + j * step) / M }),
  );
  if (reverse) line.reverse();
  return {
    ownerId: `owner-${i}`,
    observedDay: day,
    evidence: {
      sourceActivityId: `activity-${i}`,
      sourceRevision: 1,
      sport: "run",
      origin: "device-gps",
      algorithmVersion: "gps-track-evidence-v1",
      evidenceCategory: "gps_observed_use",
      status: "unverified",
      lines: [line],
      acceptedSamples: line.length,
      rejectedSamples: 0,
      eligibleForPublication: false,
    },
  };
}
const five = () => Array.from({ length: 5 }, (_, i) => observation(i));
describe("bounded internal unmapped centerlines", () => {
  it("builds median geometric centerline and robust dispersion from five independent traces", () => {
    const r = reconstruct(five());
    expect(r.incomplete).toBe(false);
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0]!;
    expect(c.geometry.length).toBeGreaterThan(20);
    expect(c.geometry.every((v) => Math.abs(v.lat * M - 0.8) < 0.01)).toBe(
      true,
    );
    expect(c.widthMeters).toBeCloseTo(0.8);
    expect(c.owners).toBe(5);
    expect(c.days).toBe(3);
    expect(c).toMatchObject({
      routingEligible: false,
      publicationEligible: false,
      physicalProtection: "unknown",
      legalAccess: "unknown",
      topology: "unknown",
      status: "proposed",
    });
  });
  it("aligns reversed traces and different sampling rates", () => {
    const r = reconstruct(
      Array.from({ length: 5 }, (_, i) =>
        observation(i, { step: i % 2 ? 15 : 10, reverse: i % 2 === 0 }),
      ),
    );
    expect(r.candidates).toHaveLength(1);
    expect(
      r.candidates[0]!.geometry.every((p) => Math.abs(p.lat * M - 0.8) < 0.01),
    ).toBe(true);
  });
  it("trims unsupported endpoints rather than endorsing a whole journey", () => {
    const o = five();
    o[4] = observation(4, { start: 60, end: 240 });
    const c = reconstruct(o).candidates[0]!;
    expect(c.geometry[0]!.lng * M).toBeGreaterThanOrEqual(59.9);
    expect(c.geometry.at(-1)!.lng * M).toBeLessThanOrEqual(240.1);
  });
  it("requires five owners and three distinct representative days", () => {
    expect(reconstruct(five().slice(0, 4)).candidates).toEqual([]);
    expect(
      reconstruct(five().map((o) => ({ ...o, observedDay: "2026-10-10" })))
        .candidates,
    ).toEqual([]);
    expect(
      reconstruct(five().map((o) => ({ ...o, ownerId: "same" }))).candidates,
    ).toEqual([]);
  });
  it("rejects exact copied geometries even reversed and resampled", () => {
    const o = Array.from({ length: 5 }, (_, i) =>
      observation(i, { offset: 0, step: i % 2 ? 5 : 10, reverse: i % 2 === 0 }),
    );
    const r = reconstruct(o);
    expect(r.candidates).toEqual([]);
    expect(
      r.rejected.filter((v) => v.reason === "duplicate_geometry"),
    ).toHaveLength(5);
  });
  it("keeps disjoint privacy fragments separate even with identical contributors", () => {
    const o = five().map((o, i) => ({
      ...o,
      evidence: {
        ...o.evidence,
        lines: [
          observation(i, { start: 0, end: 150 }).evidence.lines[0]!,
          observation(i, { start: 160, end: 310 }).evidence.lines[0]!,
        ],
      },
    }));
    const r = reconstruct(o);
    expect(r.candidates).toHaveLength(2);
    expect(
      r.candidates.every(
        (c) => c.geometry.at(-1)!.lng * M - c.geometry[0]!.lng * M <= 151,
      ),
    ).toBe(true);
  });
  it("rejects bimodal adjacent parallel tracks instead of averaging a phantom path", () => {
    const o = Array.from({ length: 6 }, (_, i) =>
      observation(i, { offset: i < 3 ? i * 0.2 : 4 + (i - 3) * 0.2 }),
    );
    expect(reconstruct(o).candidates).toEqual([]);
  });
  it("does not merge two independently supported distant parallel corridors", () => {
    const o = [
      ...five(),
      ...Array.from({ length: 5 }, (_, i) =>
        observation(i + 5, { offset: 20 + i * 0.4 }),
      ),
    ];
    const r = reconstruct(o);
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates.every((c) => c.widthMeters < 2)).toBe(true);
  });
  it("does not count crossing observations as longitudinal support", () => {
    const o = five();
    o[4]!.evidence.lines[0] = o[4]!.evidence.lines[0]!.map((p) => ({
      lat: p.lng,
      lng: p.lat,
    }));
    expect(reconstruct(o).candidates).toEqual([]);
  });
  it("rejects imports, broken dates, invalid coordinates and long missing-fix edges", () => {
    const a = observation(0);
    Object.assign(a.evidence, { origin: "import" });
    const b = observation(1, { day: "2026-02-30" });
    const c = observation(2);
    c.evidence.lines[0]![3]!.lat = NaN;
    const d = observation(3, { step: 60 });
    const r = reconstruct([a, b, c, d]);
    expect(r.candidates).toEqual([]);
    expect(r.rejected).toHaveLength(4);
  });
  it("fails closed when input or computational budgets are exhausted", () => {
    expect(
      reconstruct(Array.from({ length: 101 }, (_, i) => observation(i)))
        .incomplete,
    ).toBe(true);
    const r = reconstruct(
      Array.from({ length: 40 }, (_, i) => observation(i, { step: 1 })),
    );
    expect(r.incomplete).toBe(true);
    expect(r.candidates).toEqual([]);
  });
  it("does not let one owner's repeated days manufacture independent support dates", () => {
    const o = five().map((v) => ({ ...v, observedDay: "2026-10-10" }));
    o.push(
      observation(0, { offset: 0.1, day: "2026-10-11" }),
      observation(0, { offset: 0.15, day: "2026-10-12" }),
    );
    expect(reconstruct(o).candidates).toEqual([]);
  });
  it("does not combine sports to manufacture support", () => {
    const o = five();
    o[4]!.evidence.sport = "ride";
    expect(reconstruct(o).candidates).toEqual([]);
  });
});

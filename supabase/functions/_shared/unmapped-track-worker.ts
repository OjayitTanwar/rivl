import type { Coordinate, MappedTrack } from "./track-types.ts";
import {
  reconstructCommunityTracks,
  type ReconstructionObservation,
} from "./track-reconstruction.ts";
import { reconstructUnmappedTracks } from "./unmapped-track-reconstruction.ts";
export interface CorridorReference {
  activityId: string;
  revision: number;
  preferenceRevision: number;
  fingerprint: string;
}
export interface CorridorProposal {
  geometry: Coordinate[];
  widthMeters: number;
  sport: string;
  support: CorridorReference[];
}
function meters(a: Coordinate, b: Coordinate) {
  const r = Math.PI / 180,
    h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) *
        Math.cos(b.lat * r) *
        Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Preserve only genuine selected fixes in a single fully queried region. Never
 * bridge excursions, source gaps, or >50m missing-fix edges during decimation. */
export function clipMappingRegion(
  lines: Coordinate[][],
  center: Coordinate,
): Coordinate[][] {
  const output: Coordinate[][] = [];
  let total = 0;
  for (const source of lines) {
    let run: Coordinate[] = [];
    const flush = () => {
      if (
        run.length >= 6 &&
        run.slice(1).reduce((n, p, i) => n + meters(run[i]!, p), 0) >= 100
      ) {
        output.push(run);
        total += run.length;
      }
      run = [];
    };
    let previous: Coordinate | undefined;
    for (const point of source) {
      if (meters(point, center) > 350) {
        flush();
        previous = undefined;
        continue;
      }
      if (previous && meters(previous, point) > 50) flush();
      if (!run.length || meters(run[run.length - 1]!, point) >= 5)
        run.push({ ...point });
      previous = point;
    }
    flush();
  }
  if (output.length > 20 || total > 1000)
    throw new Error("corridor_region_limit");
  return output;
}
export function buildUnmappedProposals(
  observations: ReconstructionObservation[],
  references: CorridorReference[],
  ways: MappedTrack[],
  center: Coordinate,
): CorridorProposal[] {
  if (
    !Array.isArray(observations) ||
    observations.length !== references.length ||
    observations.length > 13 ||
    ways.length > 500
  )
    throw new Error("corridor_cohort_bound");
  const cohort: ReconstructionObservation[] = [],
    refs: CorridorReference[] = [];
  for (let index = 0; index < observations.length; index++) {
    const o = observations[index]!,
      ref = references[index]!;
    if (
      !ref ||
      ref.activityId !== o.evidence.sourceActivityId ||
      ref.revision !== o.evidence.sourceRevision ||
      !Number.isSafeInteger(ref.preferenceRevision) ||
      ref.preferenceRevision < 1 ||
      !/^[a-f0-9]{64}$/.test(ref.fingerprint)
    )
      throw new Error("invalid_corridor_reference");
    const lines = clipMappingRegion(o.evidence.lines, center);
    if (!lines.length) continue;
    const prepared = { ...o, evidence: { ...o.evidence, lines } };
    const mapped = reconstructCommunityTracks([prepared], ways, {
      includePrivateGeometry: true,
    });
    if (mapped.incomplete) throw new Error("corridor_matching_limit");
    const unmapped = mapped.fragments.flatMap((fragment) =>
      fragment.outcome === "unmapped" && fragment.unmappedGeometry
        ? [fragment.unmappedGeometry]
        : [],
    );
    if (!unmapped.length) continue;
    cohort.push({
      ...prepared,
      evidence: { ...prepared.evidence, lines: unmapped },
    });
    refs.push(ref);
  }
  if (cohort.length < 5) return [];
  const reconstructed = reconstructUnmappedTracks(cohort);
  if (reconstructed.incomplete)
    throw new Error("corridor_reconstruction_limit");
  let vertices = 0;
  return reconstructed.candidates
    .flatMap((candidate) => {
      if (candidate.geometry.length > 256) return [];
      const support = [
        ...new Set(candidate.support.map((s) => s.observation)),
      ].map((index) => refs[index]!);
      if (
        support.length < 5 ||
        new Set(support.map((r) => r.fingerprint)).size < 5
      )
        return [];
      vertices += candidate.geometry.length;
      return vertices > 1500
        ? []
        : [
            {
              geometry: candidate.geometry,
              widthMeters: candidate.widthMeters,
              sport: candidate.sport,
              support,
            },
          ];
    })
    .slice(0, 8);
}

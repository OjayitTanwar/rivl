import type { Coordinate, Sample } from "../domain/types";
import type { ExplorationTile } from "../domain/exploration";
export interface MapProps {
  points: Sample[];
  lines?: Sample[][];
  network?: Sample[][];
  height?: number;
  interactive?: boolean;
  reference?: Sample[];
  waypoints?: Coordinate[];
  center?: Coordinate;
  onMapPress?: (point: Coordinate) => void;
  autoFit?: boolean;
  showUserLocation?: boolean;
  followUser?: boolean;
  borderRadius?: number;
  highlights?: { title: string; color: string; points: Sample[] }[];
  cells?: { lat: number; lng: number; visits: number }[];
  tiles?: ExplorationTile[];
  onLocate?: () => void;
  recenterKey?: number;
  controlsTop?: number;
  explorationRoutes?: Sample[][];
  localFocus?: boolean;
  unverified?: boolean;
  mapStyle?: "roadmap" | "satellite" | "terrain";
  cyclingLayer?: boolean;
  showMapTypeControl?: boolean;
  onViewportChange?: (center: Coordinate) => void;
  /** Opt in only for device/user/OSM data, never Google-derived map content. */
  allowMapboxFallback?: boolean;
  fullScreenLoading?: boolean;
}

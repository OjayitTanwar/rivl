export type Sport = "run" | "ride" | "walk" | "hike";
export type Visibility = "private" | "friends" | "public";
export type LeaderboardGender = "women" | "men" | "nonbinary";
export type Coordinate = { lat: number; lng: number };
export interface Sample extends Coordinate {
  t: number;
  altitude?: number;
  accuracy: number;
  hr?: number;
  watts?: number;
  segment: number;
}
export interface Split {
  km: number;
  distance: number;
  seconds: number;
  pace: number;
  ascent: number;
}
export interface Effort {
  distance: number;
  seconds: number;
  start: number;
  end: number;
}
export interface Summary {
  hrZoneThresholds?: [number, number, number, number];
  hrZoneMaxHR?: number;
  laps?: RecordedLap[];
  distance: number;
  elapsed: number;
  moving: number;
  ascent: number;
  descent: number;
  avgPace: number;
  avgSpeed: number;
  avgHR: number | null;
  maxHR: number | null;
  avgPower: number | null;
  load: number;
  loadMethod: "hr-zones" | "duration-rpe";
  zones: number[];
  splits: Split[];
  bests: Effort[];
  gap: number | null;
  rejected: number;
}
export interface RecordedLap {
  start: number;
  end: number;
  distance: number;
  seconds: number;
  ascent: number;
  avgHR: number | null;
  avgPower: number | null;
}
export interface Activity {
  id: string;
  ownerId: string;
  title: string;
  sport: Sport;
  startedAt: number;
  endedAt: number;
  summary: Summary;
  route: Sample[];
  visibility: Visibility;
  note: string;
  rpe: number;
  sync: "pending" | "synced" | "error" | "local";
  revision: number;
  demo?: boolean;
  simulated?: boolean;
  photos: string[];
  photoKeys?: string[];
}
export interface PrivacyZone extends Coordinate {
  id: string;
  radius: number;
  label: string;
}
export interface Profile {
  speedUnit?: "kmh" | "mph";
  id: string;
  name: string;
  handle: string;
  bio: string;
  maxHR: number;
  hrZoneThresholds?: [number, number, number, number] | null;
  ftp?: number | null;
  weightKg?: number | null;
  birthYear?: number | null;
  segmentParticipation?: boolean;
  shareLeaderboardAge?: boolean;
  shareLeaderboardWeight?: boolean;
  leaderboardGender?: LeaderboardGender | null;
  shareLeaderboardGender?: boolean;
  restingHR: number;
  weeklyGoal: number;
  visibility: Visibility;
  theme: "system" | "light" | "dark";
  highContrast: boolean;
  autoPause: boolean;
  privacyZones: PrivacyZone[];
  demo: boolean;
}
export interface Recording {
  lapTimes?: number[];
  id: string;
  ownerId: string;
  sport: Sport;
  startedAt: number;
  state: "recording" | "paused" | "saving";
  segment: number;
  autoPause: boolean;
  simulation: boolean;
  ghostId?: string;
  savedAt?: number;
  acceptAfter?: number;
}
export interface Session {
  userId: string;
  email: string;
  demo: boolean;
  local: boolean;
}
export interface TrainingDay {
  date: string;
  load: number;
  fitness: number;
  fatigue: number;
  form: number;
  distance: number;
}
export interface CoachFacts {
  paceChange: number | null;
  efficiencyChange: number | null;
  loadChange: number | null;
  highFatigue: boolean;
  pacingFade: number | null;
  recommendation: "rest" | "easy" | "steady";
  evidence: number;
  caveats: string[];
}
export interface SocialPost {
  id: string;
  athlete: string;
  handle: string;
  initials: string;
  color: string;
  activity: Activity;
  caption: string;
  reactions: string[];
  /** Cloud totals; reactions contains only the signed-in athlete on cloud posts. */
  reactionCount?: number;
  commentCount?: number;
  comments: {
    id: string;
    authorId?: string;
    /** Original server precision retained for stable keyset pagination. */
    createdAt?: string;
    author: string;
    text: string;
    at: number;
  }[];
}
export interface RoutePlan {
  waypoints?: Coordinate[];
  routing?: "manual" | "paths" | "recorded";
  id: string;
  name: string;
  sport: Sport;
  points: Sample[];
  distance: number;
  ascent: number;
  surface: string;
  saved: boolean;
}
export interface Segment {
  id: string;
  name: string;
  sport: Sport;
  points: Coordinate[];
  distance: number;
  ascent: number;
}
export interface SegmentEffort {
  id: string;
  segmentId: string;
  athlete: string;
  athleteId: string;
  seconds: number;
  previous: number | null;
  age: number | null;
  date: number;
  friend: boolean;
  expected: number | null;
  weight?: number | null;
  checked?: boolean;
}
export interface Challenge {
  id: string;
  title: string;
  kind: "distance" | "ascent" | "days";
  target: number;
  start: number;
  end: number;
  joined: boolean;
}

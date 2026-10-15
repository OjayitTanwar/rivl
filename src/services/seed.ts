import { fixtureTrack } from "./fixture-track";
import { defaultProfile } from "./default-profile";
export { fixtureTrack, defaultProfile };
import type {
  Activity,
  Sample,
  Profile,
  SocialPost,
  RoutePlan,
  Segment,
  SegmentEffort,
  Challenge,
} from "../domain/types";
import { processActivity } from "../domain/processing";
import { simplify } from "../domain/geo";
import { DAY } from "../domain/analytics";
import type { Database } from "../storage/port";
export const DEMO_ID = "00000000-0000-4000-8000-000000000001";
export async function seedDemo(db: Database): Promise<void> {
  if (await db.get("seed:v3")) return;
  const now = Date.now();
  const profile = defaultProfile(DEMO_ID, "Maya Chen", true);
  await db.set("profile:" + DEMO_ID, profile);
  const all: Activity[] = [];
  for (let i = 0; i < 72; i++) {
    const ago = i * 1.35 + 0.2,
      start = now - ago * DAY,
      track = fixtureTrack(start, 601, 0, 280 + i * 0.65),
      summary = processActivity(
        track,
        "run",
        start,
        track[track.length - 1]!.t,
        190,
        4,
      );
    const a: Activity = {
      id: "demo-run-" + i,
      ownerId: DEMO_ID,
      title: [
        "Golden Gate, good company",
        "A little faster. A little further.",
        "The before-work loop",
        "Sunday, at my own pace",
      ][i % 4]!,
      sport: "run",
      startedAt: start,
      endedAt: track[track.length - 1]!.t,
      summary,
      route: simplify(track, 9),
      visibility: "private",
      note: "Easy miles through the park. Kept the effort honest.",
      rpe: 4,
      sync: "local",
      revision: 1,
      demo: true,
      photos: [],
    };
    all.push(a);
    await db.set("activity:" + DEMO_ID + ":" + a.id, a);
    if (i < 4) await db.appendSamples(a.id, track);
  }
  const posts: SocialPost[] = [
    {
      id: "post-1",
      athlete: "Alex Rivera",
      handle: "alexruns",
      initials: "AR",
      color: "#D8E8D6",
      activity: { ...all[0]!, id: "community-1", ownerId: "alex" },
      caption:
        "No better way to start a Wednesday. Who’s joining the weekend long run?",
      reactions: ["jun"],
      comments: [
        {
          id: "c1",
          author: "Jun Park",
          text: "Count me in for Saturday.",
          at: now - 3000000,
        },
      ],
    },
    {
      id: "post-2",
      athlete: "Jun Park",
      handle: "jun.outside",
      initials: "JP",
      color: "#DCE9F4",
      activity: {
        ...all[2]!,
        id: "community-2",
        ownerId: "jun",
        title: "Found the long way home",
      },
      caption: "Took a turn I usually skip. Worth every hill.",
      reactions: [],
      comments: [],
    },
  ];
  for (const p of posts) await db.set("post:" + DEMO_ID + ":" + p.id, p);
  for (let i = 0; i < 3; i++) {
    const track = fixtureTrack(now, 601, i);
    const route: RoutePlan = {
      id: "route-" + i,
      name: [
        "The Golden Gate loop",
        "Ocean air, easy miles",
        "The rolling Presidio",
      ][i]!,
      sport: "run",
      points: simplify(track),
      distance: processActivity(track, "run", now, track[600]!.t).distance,
      ascent: 80 + i * 35,
      surface: i === 2 ? "Mixed trail" : "Paved · park paths",
      saved: i === 0,
    };
    await db.set("route:" + DEMO_ID + ":" + route.id, route);
  }
  const points = fixtureTrack(now).slice(50, 140),
    segment: Segment = {
      id: "seg-1",
      name: "Panhandle, westbound",
      sport: "run",
      points: [points[0]!, points[40]!, points[points.length - 1]!],
      distance: 1200,
      ascent: 14,
    };
  await db.set("segment:" + DEMO_ID + ":" + segment.id, segment);
  for (let i = 0; i < 8; i++) {
    const e: SegmentEffort = {
      id: "effort-" + i,
      segmentId: "seg-1",
      athlete: [
        "Alex Rivera",
        "Maya Chen",
        "Jun Park",
        "Sam Ellis",
        "Drew Patel",
        "Ali Morgan",
        "Remy Cole",
        "Chris Wu",
      ][i]!,
      athleteId: i === 1 ? DEMO_ID : "athlete-" + i,
      seconds: 258 + i * 9,
      previous: 280 + i * 12,
      age: 26 + i * 2,
      date: now - i * DAY,
      friend: i < 4,
      expected: 270 + i * 13,
    };
    await db.set("effort:" + DEMO_ID + ":" + e.id, e);
  }
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  for (const c of [
    {
      id: "c-distance",
      title: "The 100 km club",
      kind: "distance",
      target: 100000,
    },
    {
      id: "c-hills",
      title: "Take the high road",
      kind: "ascent",
      target: 1000,
    },
    { id: "c-days", title: "Show up for 16", kind: "days", target: 16 },
  ] as const) {
    await db.set<Challenge>("challenge:" + DEMO_ID + ":" + c.id, {
      ...c,
      start: start.getTime(),
      end: end.getTime() - 1,
      joined: c.id === "c-distance",
    });
  }
  await db.set("seed:v3", true);
}

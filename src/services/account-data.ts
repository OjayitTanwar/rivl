import type { Database } from "../storage/port";
import type { Activity, Recording, Session } from "../domain/types";
import { WellnessRepository } from "./wellness-repository";
import { CommunityTrackRepository } from "./community-track-repository";
import { NutritionRepository } from "./nutrition-repository";
import { TrainingRepository } from "./training-repository";
import { SleepRepository } from "./sleep-repository";
import { NutritionPlanningRepository } from "./nutrition-planning-repository";
import { CreatorTrainingRepository } from "./creator-training-repository";
export async function purgeAccountData(
  db: Database,
  session: Session,
): Promise<void> {
  await db.remove("health:" + session.userId);
  await new WellnessRepository(db).purge(session.userId);
  await new CommunityTrackRepository(db).purge(session.userId);
  await new NutritionRepository(db).purge(session.userId);
  await new TrainingRepository(db).purge(session.userId);
  await new CreatorTrainingRepository(db).purge(session.userId);
  await new SleepRepository(db).purge(session.userId);
  await new NutritionPlanningRepository(db).purge(session.userId);
  const activities = await db.list<Activity>(
    "activity:" + session.userId + ":",
  );
  const active = await db.get<Recording>("recording:active");
  const ids = new Set(activities.map((activity) => activity.id));
  if (active?.ownerId === session.userId) {
    ids.add(active.id);
  }
  for (const id of ids) {
    await db.deleteSamples(id);
    await db.remove("recording:stats:" + id);
  }
  // Keep the recording ID recoverable until its raw coordinates are erased.
  if (active?.ownerId === session.userId) await db.remove("recording:active");
  for (const prefix of [
    "activity:",
    "post:",
    "route:",
    "challenge:",
    "segment:",
    "effort:",
    "outbox:",
    "report:",
    "route-outbox:",
    "route-draft:",
    "offline-area:",
    "offline-guide:",
    "power-curve:",
    "watch-import:",
    "gear:",
    "gear-activity:",
  ])
    await db.removePrefix(prefix + session.userId + ":");
  for (const prefix of [
    "profile:",
    "auto-record:",
    "cursor:",
    "following:",
    "clubs:",
    "blocks:",
    "route-draft:",
  ])
    await db.remove(prefix + session.userId);
  await db.remove("local-auth:" + session.email.toLowerCase());
  if ((await db.get<Session>("session"))?.userId === session.userId)
    await db.remove("session");
  if (session.demo) await db.remove("seed:v3");
}

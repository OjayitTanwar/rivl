import { expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { purgeAccountData } from "../src/services/account-data";
import { NutritionRepository } from "../src/services/nutrition-repository";
import { TrainingRepository } from "../src/services/training-repository";
import { WellnessRepository } from "../src/services/wellness-repository";
import { CommunityTrackRepository } from "../src/services/community-track-repository";
it("blocks late workspace writes during account cleanup while allowing each queued purge", async () => {
  const db = new MemoryDatabase(),
    owner = {
      userId: "me",
      email: "me@example.test",
      local: true,
      demo: false,
    };
  await db.set("session", owner);
  await db.set("account:cleanup", owner);
  await db.set("nutrition:me:old", {});
  await db.set("guided-session:me", {});
  await db.set("creator-training:me:program:old", {});
  await db.set("wellness:me:old", {});
  await db.set("track-mapping:me", {});
  await purgeAccountData(db, owner);
  // A stale foreground screen still holds the old owner until cleanup completes.
  await db.set("session", owner);
  await expect(
    new NutritionRepository(db).save(
      {
        id: "new",
        ownerId: "me",
        day: "2026-10-14",
        meal: "lunch",
        grams: 100,
        food: {
          name: "Label entry",
          brand: "",
          source: "manual",
          per100g: { kcal: 100, protein: 5, carbs: 15, fat: 2 },
        },
        updatedAt: Date.now(),
      },
      null,
    ),
  ).rejects.toThrow();
  await expect(
    new TrainingRepository(db).save(
      {
        id: "new",
        ownerId: "me",
        title: "Intervals",
        sport: "run",
        warmupSec: 60,
        workSec: 60,
        recoverySec: 60,
        repeats: 2,
        cooldownSec: 60,
        updatedAt: Date.now(),
      },
      null,
    ),
  ).rejects.toThrow();
  await expect(
    new WellnessRepository(db).save(
      {
        id: "new",
        ownerId: "me",
        kind: "water",
        value: 250,
        at: Date.now(),
        note: "",
      },
      null,
    ),
  ).rejects.toThrow();
  await expect(
    new CommunityTrackRepository(db).setEnabled("me", true),
  ).rejects.toThrow();
  for (const prefix of [
    "nutrition:me:",
    "guided-training:me:",
    "creator-training:me:",
    "wellness:me:",
    "track-contribution:me:",
  ])
    expect(await db.list(prefix)).toEqual([]);
  expect(await db.get("guided-session:me")).toBeNull();
  expect(await db.get("track-mapping:me")).toBeNull();
});

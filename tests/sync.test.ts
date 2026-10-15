import { describe, it, expect } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { SyncEngine, type ActivityRemote } from "../src/services/sync-engine";
import { processActivity } from "../src/domain/processing";
import type { Activity } from "../src/domain/types";
function activity(): Activity {
  return {
    id: "a",
    ownerId: "u",
    title: "Run",
    sport: "run",
    startedAt: 0,
    endedAt: 1000,
    summary: processActivity([], "run", 0, 1000),
    route: [],
    visibility: "private",
    note: "",
    rpe: 5,
    sync: "pending",
    revision: 1,
    photos: [],
  };
}
describe("durable activity synchronization", () => {
  it("retains activity and raw data on failure, survives restart and retries idempotently", async () => {
    const db = new MemoryDatabase(),
      a = activity();
    let attempts = 0;
    const remote: ActivityRemote = {
      async upload() {
        attempts++;
        if (attempts === 1) throw new Error("offline");
      },
      async pull() {
        return [];
      },
    };
    await db.appendSamples("a", [
      { lat: 0, lng: 0, t: 0, accuracy: 4, segment: 0 },
    ]);
    const first = new SyncEngine(db, remote);
    await first.enqueue(a);
    await first.run("u", 1000);
    expect((await db.get<Activity>("activity:u:a"))?.sync).toBe("error");
    expect(await db.samples("a")).toHaveLength(1);
    const restarted = new SyncEngine(db, remote);
    await restarted.run("u", 3000);
    expect((await db.get<Activity>("activity:u:a"))?.sync).toBe("synced");
    expect(await db.list("outbox:u:")).toHaveLength(0);
  });
  it("never syncs another account", async () => {
    const db = new MemoryDatabase();
    let uploads = 0;
    const engine = new SyncEngine(db, {
      async upload() {
        uploads++;
      },
      async pull() {
        return [];
      },
    });
    await engine.enqueue(activity());
    await engine.run("other");
    expect(uploads).toBe(0);
  });
  it("repairs a crash between local save and outbox insertion", async () => {
    const db = new MemoryDatabase();
    await db.set("activity:u:a", activity());
    const engine = new SyncEngine(db, {
      async upload() {},
      async pull() {
        return [];
      },
    });
    await engine.run("u");
    expect((await db.get<Activity>("activity:u:a"))?.sync).toBe("synced");
  });
  it("does not acknowledge a newer edit with an older upload", async () => {
    const db = new MemoryDatabase(),
      a = activity();
    const engine = new SyncEngine(db, {
      async upload() {
        await engine.enqueue({ ...a, revision: 2, title: "Updated" });
      },
      async pull() {
        return [];
      },
    });
    await engine.enqueue(a);
    await engine.run("u");
    expect((await db.get<Activity>("activity:u:a"))?.revision).toBe(2);
    expect(await db.list("outbox:u:")).toHaveLength(1);
  });
});

it("respects retry backoff until the athlete explicitly retries", async () => {
  const db = new MemoryDatabase();
  let attempts = 0;
  const engine = new SyncEngine(db, {
    async upload() {
      attempts++;
      throw new Error("offline");
    },
    async pull() {
      return [];
    },
  });
  await engine.enqueue(activity());
  await engine.run("u", 1000);
  await engine.run("u", 1100);
  expect(attempts).toBe(1);
  await engine.run("u", 1200, true);
  expect(attempts).toBe(2);
});
it("recovers legacy simulated outbox entries without publishing them", async () => {
  const db = new MemoryDatabase();
  let uploads = 0;
  await db.set("activity:u:a", { ...activity(), demo: true });
  const engine = new SyncEngine(db, {
    async upload() {
      uploads++;
    },
    async pull() {
      return [];
    },
  });
  await engine.run("u");
  expect(uploads).toBe(0);
  expect((await db.get<Activity>("activity:u:a"))?.sync).toBe("local");
  expect(await db.list("outbox:u:")).toHaveLength(0);
});
it("uses the server cursor and retains local photos during cloud refresh", async () => {
  const db = new MemoryDatabase();
  await db.set("activity:u:a", {
    ...activity(),
    sync: "synced",
    photos: ["file:///photo.jpg"],
  });
  const engine = new SyncEngine(db, {
    async upload() {},
    async pull() {
      return {
        activities: [
          { ...activity(), photos: ["https://example.test/signed.jpg"] },
        ],
        cursor: 5000,
      };
    },
  });
  await engine.run("u", 9999999);
  expect(await db.get("cursor:u")).toBe(5000);
  expect((await db.get<Activity>("activity:u:a"))?.photos).toHaveLength(2);
});
it("does not show a second copy of a local photo after its cloud upload", async () => {
  const db = new MemoryDatabase();
  await db.set("activity:u:a", {
    ...activity(),
    sync: "synced",
    photos: ["file:///photos/image.jpg"],
  });
  const engine = new SyncEngine(db, {
    async upload() {},
    async pull() {
      return [
        {
          ...activity(),
          photoKeys: ["u/a/image.jpg"],
          photos: ["https://example.test/image.jpg?signature=abc"],
        },
      ];
    },
  });
  await engine.run("u");
  expect((await db.get<Activity>("activity:u:a"))?.photos).toEqual([
    "file:///photos/image.jpg",
  ]);
});

it("keeps the previous activity and queue revision if committing an edit fails", async () => {
  class FailingDatabase extends MemoryDatabase {
    override async commit(): Promise<void> {
      throw new Error("storage failure");
    }
  }
  const db = new FailingDatabase(),
    original = activity();
  await db.set("activity:u:a", original);
  await db.set("outbox:u:a", {
    id: "a",
    ownerId: "u",
    revision: 1,
    attempts: 0,
    nextAttempt: 0,
  });
  const engine = new SyncEngine(db, {
    async upload() {},
    async pull() {
      return [];
    },
  });
  await expect(
    engine.enqueue({ ...original, title: "Updated title", revision: 2 }),
  ).rejects.toThrow("storage failure");
  expect(await db.get("activity:u:a")).toEqual(original);
  expect((await db.get<{ revision: number }>("outbox:u:a"))?.revision).toBe(1);
});

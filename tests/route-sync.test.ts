import { describe, expect, it } from "vitest";
import {
  RouteRepository,
  type RouteMutation,
  type RouteRemote,
} from "../src/services/route-repository";
import type { RoutePlan } from "../src/domain/types";
import { MemoryDatabase } from "../src/storage/port";

function route(id: string, name = id): RoutePlan {
  return {
    id,
    name,
    sport: "run",
    points: [],
    distance: 2400,
    ascent: 20,
    surface: "road",
    saved: true,
  };
}

function tokens() {
  let next = 0;
  return () => `token-${++next}`;
}

describe("durable route synchronization", () => {
  it("keeps an offline save locally and uploads it after restart", async () => {
    const db = new MemoryDatabase();
    const first = new RouteRepository(db, { async write() {} }, tokens());
    await first.save("athlete", route("loop"), false);

    expect(await db.get<RoutePlan>("route:athlete:loop")).toEqual(
      route("loop"),
    );
    expect(await db.list<RouteMutation>("route-outbox:athlete:")).toHaveLength(
      1,
    );

    const uploads: RouteMutation[] = [];
    const restarted = new RouteRepository(
      db,
      {
        async write(mutation) {
          uploads.push(mutation);
        },
      },
      tokens(),
    );
    await restarted.sync("athlete");

    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      id: "loop",
      owner: "athlete",
      route: route("loop"),
    });
    expect(await db.list<RouteMutation>("route-outbox:athlete:")).toHaveLength(
      0,
    );
  });

  it("persists a delete tombstone through restart and syncs it", async () => {
    const db = new MemoryDatabase();
    const first = new RouteRepository(db, { async write() {} }, tokens());
    await first.save("athlete", route("loop"), false);
    await first.delete("athlete", "loop", false);
    expect(await db.get<RoutePlan>("route:athlete:loop")).toBeNull();
    expect(
      await db.get<RouteMutation>("route-outbox:athlete:loop"),
    ).toMatchObject({
      id: "loop",
      owner: "athlete",
      route: null,
    });

    const writes: RouteMutation[] = [];
    await new RouteRepository(
      db,
      {
        async write(mutation) {
          writes.push(mutation);
        },
      },
      tokens(),
    ).sync("athlete");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.route).toBeNull();
    expect(await db.get("route-outbox:athlete:loop")).toBeNull();
  });

  it("uploads an edit made during an earlier upload before completing sync", async () => {
    const db = new MemoryDatabase();
    let release!: () => void;
    let started!: () => void;
    const uploadStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const uploaded: string[] = [];
    const repository = new RouteRepository(
      db,
      {
        async write(mutation) {
          uploaded.push(mutation.route!.name);
          if (uploaded.length === 1) {
            started();
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
        },
      },
      tokens(),
    );
    await repository.save("athlete", route("loop", "First name"), false);
    const syncing = repository.sync("athlete");
    await uploadStarted;
    await repository.save("athlete", route("loop", "Edited name"), false);
    release();
    await syncing;

    expect((await db.get<RoutePlan>("route:athlete:loop"))?.name).toBe(
      "Edited name",
    );
    expect(uploaded).toEqual(["First name", "Edited name"]);
    expect(await db.get("route-outbox:athlete:loop")).toBeNull();
  });

  it("ignores a cloud snapshot requested before a save or delete", async () => {
    const db = new MemoryDatabase();
    const repository = new RouteRepository(db, { async write() {} }, tokens());
    const beforeSave = repository.version("athlete");
    await repository.save("athlete", route("loop", "Local save"), false);
    await repository.reconcile(
      "athlete",
      [route("loop", "Stale cloud")],
      beforeSave,
    );
    expect((await db.get<RoutePlan>("route:athlete:loop"))?.name).toBe(
      "Local save",
    );

    const beforeDelete = repository.version("athlete");
    await repository.delete("athlete", "loop", false);
    await repository.reconcile(
      "athlete",
      [route("loop", "Stale cloud")],
      beforeDelete,
    );
    expect(await db.get<RoutePlan>("route:athlete:loop")).toBeNull();
  });

  it("lets pending local edits and deletes win over a cloud snapshot", async () => {
    const db = new MemoryDatabase();
    const repository = new RouteRepository(db, { async write() {} }, tokens());
    await repository.save("athlete", route("edited", "Local name"), false);
    await repository.save("athlete", route("removed"), false);
    await repository.delete("athlete", "removed", false);

    const requestVersion = repository.version("athlete");
    await repository.reconcile(
      "athlete",
      [
        route("edited", "Cloud name"),
        route("removed", "Cloud copy"),
        route("cloud-only", "Cloud only"),
      ],
      requestVersion,
    );

    expect((await db.get<RoutePlan>("route:athlete:edited"))?.name).toBe(
      "Local name",
    );
    expect(await db.get<RoutePlan>("route:athlete:removed")).toBeNull();
    expect(await db.get<RoutePlan>("route:athlete:cloud-only")).toEqual(
      route("cloud-only", "Cloud only"),
    );
  });

  it("keeps outbox sync isolated by account", async () => {
    const db = new MemoryDatabase();
    const writes: RouteMutation[] = [];
    const remote: RouteRemote = {
      async write(mutation) {
        writes.push(mutation);
      },
    };
    const first = new RouteRepository(db, remote, tokens());
    await first.save("alice", route("alice-loop"), false);
    await first.save("bob", route("bob-loop"), false);

    await new RouteRepository(db, remote, tokens()).sync("alice");
    expect(writes.map((write) => write.owner)).toEqual(["alice"]);
    expect(await db.list<RouteMutation>("route-outbox:bob:")).toHaveLength(1);
    expect(await db.get<RoutePlan>("route:bob:bob-loop")).toEqual(
      route("bob-loop"),
    );
  });
});

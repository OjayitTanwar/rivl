import type { RoutePlan } from "../domain/types";
import type { Database } from "../storage/port";

export interface RouteMutation {
  id: string;
  owner: string;
  token: string;
  route: RoutePlan | null;
}
export interface RouteRemote {
  write(mutation: RouteMutation): Promise<void>;
}

export class RouteRepository {
  private serial: Promise<unknown> = Promise.resolve();
  private revisions = new Map<string, number>();
  private flights = new Map<string, Promise<void>>();
  constructor(
    private db: Database,
    private remote: RouteRemote,
    private token: () => string,
  ) {}

  version(owner: string) {
    return this.revisions.get(owner) ?? 0;
  }
  private locked<T>(work: () => Promise<T>): Promise<T> {
    const task = this.serial.then(work, work);
    this.serial = task.catch(() => undefined);
    return task;
  }
  private bump(owner: string) {
    this.revisions.set(owner, this.version(owner) + 1);
  }

  save(owner: string, route: RoutePlan, local: boolean): Promise<void> {
    return this.mutate(owner, route.id, route, local);
  }
  delete(owner: string, id: string, local: boolean): Promise<void> {
    return this.mutate(owner, id, null, local);
  }
  private mutate(
    owner: string,
    id: string,
    route: RoutePlan | null,
    local: boolean,
  ) {
    return this.locked(async () => {
      const key = `route:${owner}:${id}`;
      const queue = `route-outbox:${owner}:${id}`;
      const values: Record<string, unknown> = route ? { [key]: route } : {};
      if (!local)
        values[queue] = {
          id,
          owner,
          route,
          token: this.token(),
        } satisfies RouteMutation;
      await this.db.commit(values, [
        ...(route ? [] : [key]),
        ...(local ? [queue] : []),
      ]);
      this.bump(owner);
    });
  }

  sync(owner: string): Promise<void> {
    const pending = this.flights.get(owner);
    if (pending) return pending;
    const task = this.drain(owner).finally(() => this.flights.delete(owner));
    this.flights.set(owner, task);
    return task;
  }
  private async drain(owner: string) {
    while (true) {
      const queue = await this.db.list<RouteMutation>(`route-outbox:${owner}:`);
      if (!queue.length) return;
      for (const item of queue) {
        if (item.owner !== owner) throw new Error("Route queue owner mismatch");
        await this.remote.write(item);
        await this.locked(async () => {
          const key = `route-outbox:${owner}:${item.id}`;
          // A successful older upload must not acknowledge a newer local edit.
          if ((await this.db.get<RouteMutation>(key))?.token === item.token) {
            await this.db.remove(key);
            this.bump(owner);
          }
        });
      }
    }
  }

  reconcile(
    owner: string,
    routes: RoutePlan[],
    requestVersion: number,
    guard?: () => Promise<void>,
  ): Promise<void> {
    return this.locked(async () => {
      // A remote response started before a save/delete can no longer replace this cache.
      if (this.version(owner) !== requestVersion) return;
      const prefix = `route:${owner}:`;
      const pending = new Set(
        (await this.db.list<RouteMutation>(`route-outbox:${owner}:`)).map(
          (item) => item.id,
        ),
      );
      const incoming = new Set(routes.map((route) => route.id));
      const existing = await this.db.list<RoutePlan>(prefix);
      const values: Record<string, unknown> = {};
      for (const route of routes)
        if (!pending.has(route.id)) values[prefix + route.id] = route;
      await guard?.();
      await this.db.commit(
        values,
        existing
          .filter((route) => !incoming.has(route.id) && !pending.has(route.id))
          .map((route) => prefix + route.id),
      );
    });
  }
}

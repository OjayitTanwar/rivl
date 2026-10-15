import type { Database } from "./port";
import type { Sample } from "../domain/types";
let connection: Promise<IDBDatabase> | null = null;
function open() {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("rivl-v1", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("kv");
        const gps = req.result.createObjectStore("gps", {
          keyPath: ["session", "t"],
        });
        gps.createIndex("session", "session");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return connection;
}
async function transaction<T>(
  name: string,
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode),
      req = work(tx.objectStore(name));
    let result: T;
    req.onsuccess = () => {
      result = req.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? req.error);
    tx.onerror = () => reject(tx.error ?? req.error);
  });
}
export const database: Database = {
  async commit(values, removeKeys = []) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      for (const key of removeKeys) store.delete(key);
      for (const [key, value] of Object.entries(values)) store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  async get<T>(k: string) {
    return (
      (await transaction<T | undefined>("kv", "readonly", (s) => s.get(k))) ??
      null
    );
  },
  async set(k, v) {
    await transaction("kv", "readwrite", (s) => s.put(v, k));
  },
  async remove(k) {
    await transaction("kv", "readwrite", (s) => s.delete(k));
  },
  async removePrefix(prefix: string) {
    await transaction("kv", "readwrite", (s) =>
      s.delete(IDBKeyRange.bound(prefix, prefix + "\uffff")),
    );
  },
  async list<T>(prefix: string) {
    return transaction<T[]>("kv", "readonly", (s) =>
      s.getAll(IDBKeyRange.bound(prefix, prefix + "\uffff")),
    );
  },
  async appendSamples(id, points) {
    await database.commitSamples(id, points, {});
  },
  async commitSamples(id, points, values) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["gps", "kv"], "readwrite"),
        s = tx.objectStore("gps");
      for (const p of points) s.put({ ...p, session: id });
      for (const [key, value] of Object.entries(values))
        tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  async samples(id) {
    return (
      await transaction<(Sample & { session: string })[]>(
        "gps",
        "readonly",
        (s) => s.index("session").getAll(id),
      )
    ).sort((a, b) => a.t - b.t);
  },
  async samplesSince(id, after, limit = 1000) {
    return transaction<Sample[]>("gps", "readonly", (s) =>
      s.getAll(
        IDBKeyRange.bound([id, after], [id, Number.MAX_VALUE], true, false),
        limit,
      ),
    );
  },
  async deleteSamples(id) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("gps", "readwrite"),
        req = tx
          .objectStore("gps")
          .index("session")
          .openCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          c.delete();
          c.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

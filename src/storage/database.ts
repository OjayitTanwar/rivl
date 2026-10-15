import * as SQLite from "expo-sqlite";
import { openEncryptedDatabase, withEncryptedTransaction } from "./encrypted";
import type { Database } from "./port";
let opening: Promise<SQLite.SQLiteDatabase> | null = null;
async function open() {
  if (!opening)
    opening = (async () => {
      const db = await openEncryptedDatabase();
      try {
        await db.execAsync(
          "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS gps(session TEXT NOT NULL,t REAL NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,alt REAL,accuracy REAL NOT NULL,hr REAL,watts REAL,segment INTEGER NOT NULL,PRIMARY KEY(session,t)); PRAGMA user_version=1;",
        );
        return db;
      } catch (error) {
        await db.closeAsync();
        throw error;
      }
    })().catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}
export const database: Database = {
  async commit(values, removeKeys = []) {
    const entries = Object.entries(values).map(
      ([key, value]) => [key, JSON.stringify(value)] as const,
    );
    const db = await open();
    await withEncryptedTransaction(db, async (tx) => {
      for (const key of removeKeys)
        await tx.runAsync("DELETE FROM kv WHERE key=?", key);
      for (const [key, value] of entries)
        await tx.runAsync(
          "INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key,
          value,
        );
    });
  },
  async get<T>(key: string) {
    const row = await (
      await open()
    ).getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key=?", key);
    return row ? (JSON.parse(row.value) as T) : null;
  },
  async set(k, v) {
    await (
      await open()
    ).runAsync(
      "INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      k,
      JSON.stringify(v),
    );
  },
  async remove(k) {
    await (await open()).runAsync("DELETE FROM kv WHERE key=?", k);
  },
  async removePrefix(prefix: string) {
    await (
      await open()
    ).runAsync(
      "DELETE FROM kv WHERE key >= ? AND key < ?",
      prefix,
      prefix + "\uffff",
    );
  },
  async list<T>(prefix: string) {
    const rows = await (
      await open()
    ).getAllAsync<{ value: string }>(
      "SELECT value FROM kv WHERE key >= ? AND key < ?",
      prefix,
      prefix + "\uffff",
    );
    return rows.map((r) => JSON.parse(r.value) as T);
  },
  async appendSamples(id, points) {
    await database.commitSamples(id, points, {});
  },
  async commitSamples(id, points, values) {
    const db = await open();
    await withEncryptedTransaction(db, async (tx) => {
      for (const p of points)
        await tx.runAsync(
          "INSERT INTO gps VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(session,t) DO UPDATE SET hr=coalesce(excluded.hr,gps.hr),watts=coalesce(excluded.watts,gps.watts)",
          id,
          p.t,
          p.lat,
          p.lng,
          p.altitude ?? null,
          p.accuracy,
          p.hr ?? null,
          p.watts ?? null,
          p.segment,
        );
      for (const [key, value] of Object.entries(values)) {
        await tx.runAsync(
          "INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key,
          JSON.stringify(value),
        );
      }
    });
  },
  async samples(id) {
    return database.samplesSince(id, -1, 1000000);
  },
  async samplesSince(id, after, limit = 1000) {
    const rows = await (
      await open()
    ).getAllAsync<{
      t: number;
      lat: number;
      lng: number;
      alt: number | null;
      accuracy: number;
      hr: number | null;
      watts: number | null;
      segment: number;
    }>(
      "SELECT * FROM gps WHERE session=? AND t>? ORDER BY t LIMIT ?",
      id,
      after,
      limit,
    );
    return rows.map((p) => ({
      ...p,
      altitude: p.alt ?? undefined,
      hr: p.hr ?? undefined,
      watts: p.watts ?? undefined,
    }));
  },
  async deleteSamples(id) {
    await (await open()).runAsync("DELETE FROM gps WHERE session=?", id);
  },
};

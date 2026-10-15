import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Files from "expo-file-system/legacy";
import { AppFailure } from "../security/errors";
import { preparePrivateFiles } from "../security/private-files";
const oldName = "rivl-v1.db";
const name = "rivl-private-v2.db";
const keyName = "rivl.database.key.v2";
const marker = "encryption:migration-complete";
const keyOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  requireAuthentication: false,
};
const path = (file: string) => `${SQLite.defaultDatabaseDirectory}/${file}`;
const uri = (file: string) =>
  path(file).startsWith("file:") ? path(file) : "file://" + path(file);
const exists = async (file: string) =>
  (await Files.getInfoAsync(uri(file))).exists;
const literal = (value: string) => "'" + value.replace(/'/g, "''") + "'";
async function ensureCipher(db: SQLite.SQLiteDatabase) {
  const version = await db.getFirstAsync<{ cipher_version: string }>(
    "PRAGMA cipher_version",
  );
  if (!version?.cipher_version)
    throw new AppFailure(
      "storage",
      "This version needs a new native build to open encrypted workouts. Rebuild RIVL and retry.",
    );
}
const connectionKeys = new WeakMap<SQLite.SQLiteDatabase, string>();
async function unlock(key: string, useNewConnection = false) {
  const db = await SQLite.openDatabaseAsync(name, { useNewConnection });
  try {
    await ensureCipher(db);
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await db.getFirstAsync("SELECT count(*) FROM sqlite_master");
    connectionKeys.set(db, key);
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
async function cleanupPlaintext() {
  if (await exists(oldName)) await SQLite.deleteDatabaseAsync(oldName);
  for (const suffix of ["-wal", "-shm", "-journal"])
    await Files.deleteAsync(uri(oldName + suffix), { idempotent: true });
}
async function migrate(key: string) {
  const source = await SQLite.openDatabaseAsync(oldName, {
    useNewConnection: true,
  });
  let attached = false;
  try {
    await ensureCipher(source);
    await source.execAsync("PRAGMA wal_checkpoint(TRUNCATE)");
    await source.execAsync(
      `ATTACH DATABASE ${literal(path(name).replace(/^file:\/\//, ""))} AS encrypted KEY "x'${key}'";`,
    );
    attached = true;
    await source.execAsync("BEGIN EXCLUSIVE");
    try {
      await source.getFirstAsync("SELECT sqlcipher_export('encrypted')");
      const before = await source.getFirstAsync<{ kv: number; gps: number }>(
        "SELECT (SELECT count(*) FROM main.kv) AS kv,(SELECT count(*) FROM main.gps) AS gps",
      );
      const after = await source.getFirstAsync<{ kv: number; gps: number }>(
        "SELECT (SELECT count(*) FROM encrypted.kv) AS kv,(SELECT count(*) FROM encrypted.gps) AS gps",
      );
      if (
        !before ||
        !after ||
        before.kv !== after.kv ||
        before.gps !== after.gps
      )
        throw new AppFailure(
          "storage",
          "Encrypted migration did not verify. Your original workouts have been retained.",
        );
      await source.runAsync(
        "INSERT OR REPLACE INTO encrypted.kv(key,value) VALUES(?,?)",
        marker,
        "true",
      );
      await source.execAsync("PRAGMA encrypted.user_version=1; COMMIT");
    } catch (error) {
      await source.execAsync("ROLLBACK");
      throw error;
    }
  } finally {
    try {
      if (attached) await source.execAsync("DETACH DATABASE encrypted");
    } finally {
      await source.closeAsync();
    }
  }
}
export async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  await preparePrivateFiles();
  const plaintextExists = await exists(oldName);
  const encryptedExists = await exists(name);
  let key = await SecureStore.getItemAsync(keyName, keyOptions);
  if (!key && encryptedExists)
    throw new AppFailure(
      "storage",
      "The encryption key is unavailable. Unlock the device and retry. RIVL will not overwrite your workouts.",
    );
  if (!key) {
    key = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await SecureStore.setItemAsync(keyName, key, keyOptions);
  }
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new AppFailure(
      "storage",
      "The stored encryption key is invalid. Workouts have not been modified.",
    );
  if (plaintextExists) {
    let complete = false;
    if (encryptedExists) {
      const candidate = await unlock(key);
      try {
        const table = await candidate.getFirstAsync(
          "SELECT name FROM sqlite_master WHERE name='kv'",
        );
        complete =
          !!table &&
          !!(await candidate.getFirstAsync(
            "SELECT key FROM kv WHERE key=?",
            marker,
          ));
      } finally {
        await candidate.closeAsync();
      }
      if (!complete) await SQLite.deleteDatabaseAsync(name);
    }
    if (!complete) await migrate(key);
  }
  const db = await unlock(key);
  try {
    if (plaintextExists) {
      const check = await db.getFirstAsync<{ integrity_check: string }>(
        "PRAGMA integrity_check",
      );
      if (check?.integrity_check !== "ok")
        throw new AppFailure(
          "storage",
          "Database verification failed. RIVL has preserved the existing files for recovery.",
        );
      await cleanupPlaintext();
    }
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

// Expo's exclusive transaction helper opens a new, unkeyed connection. SQLCipher
// keys belong to each connection, so unlock ours before beginning a transaction.
export async function withEncryptedTransaction(
  database: SQLite.SQLiteDatabase,
  task: (transaction: SQLite.SQLiteDatabase) => Promise<void>,
): Promise<void> {
  const key = connectionKeys.get(database);
  if (!key)
    throw new AppFailure("storage", "Reopen protected storage and retry.");
  const transaction = await unlock(key, true);
  try {
    await transaction.execAsync(
      "PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
    );
    await transaction.execAsync("BEGIN IMMEDIATE");
    try {
      await task(transaction);
      await transaction.execAsync("COMMIT");
    } catch (error) {
      await transaction.execAsync("ROLLBACK");
      throw error;
    }
  } finally {
    await transaction.closeAsync();
  }
}

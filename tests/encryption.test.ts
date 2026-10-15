import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({
  key: null as string | null,
  files: new Set<string>(),
  remove: vi.fn(),
  close: vi.fn(),
  query: vi.fn(),
  exec: vi.fn(),
  native: vi.fn(),
  setKey: vi.fn(),
}));
vi.mock("../src/security/private-files", () => ({
  preparePrivateFiles: io.native,
}));
vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "after-first-unlock",
  getItemAsync: async () => io.key,
  setItemAsync: io.setKey,
}));
vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: async () => new Uint8Array(32).fill(42),
}));
vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: async (uri: string) => ({
    exists: io.files.has(uri.split("/").at(-1)!),
  }),
  deleteAsync: io.remove,
}));
vi.mock("expo-sqlite", () => ({
  defaultDatabaseDirectory: "file:///Documents/SQLite",
  deleteDatabaseAsync: io.remove,
  openDatabaseAsync: async () => ({
    getFirstAsync: io.query,
    execAsync: io.exec,
    closeAsync: io.close,
    runAsync: vi.fn(),
  }),
}));
import { openEncryptedDatabase } from "../src/storage/encrypted";
beforeEach(() => {
  vi.clearAllMocks();
  io.key = null;
  io.files.clear();
  io.query.mockImplementation(async (sql: string) =>
    sql === "PRAGMA cipher_version" ? { cipher_version: "4" } : null,
  );
});
it("fails closed when an existing encrypted database has lost its key", async () => {
  io.files.add("rivl-private-v2.db");
  await expect(openEncryptedDatabase()).rejects.toThrow("will not overwrite");
  expect(io.remove).not.toHaveBeenCalled();
  expect(io.setKey).not.toHaveBeenCalled();
});
it("requires SQLCipher and preserves original files on an old native binary", async () => {
  io.files.add("rivl-v1.db");
  io.query.mockResolvedValue(null);
  await expect(openEncryptedDatabase()).rejects.toThrow("new native build");
  expect(io.remove).not.toHaveBeenCalled();
  expect(io.close).toHaveBeenCalled();
});
it("creates a random protected key without scanning the full database on every launch", async () => {
  await openEncryptedDatabase();
  expect(io.setKey).toHaveBeenCalledWith(
    "rivl.database.key.v2",
    "2a".repeat(32),
    { keychainAccessible: "after-first-unlock", requireAuthentication: false },
  );
  expect(io.exec).toHaveBeenCalledWith(`PRAGMA key = "x'${"2a".repeat(32)}'";`);
  expect(io.query).not.toHaveBeenCalledWith("PRAGMA integrity_check");
  expect(io.native).toHaveBeenCalledBefore(io.setKey);
});
it("rolls back export mismatches without deleting the plaintext recovery copy", async () => {
  io.key = "ab".repeat(32);
  io.files.add("rivl-v1.db");
  io.query.mockImplementation(async (sql: string) => {
    if (sql === "PRAGMA cipher_version") return { cipher_version: "4" };
    if (sql.includes("main.kv")) return { kv: 4, gps: 10 };
    if (sql.includes("encrypted.kv")) return { kv: 4, gps: 9 };
    return null;
  });
  await expect(openEncryptedDatabase()).rejects.toThrow(
    "original workouts have been retained",
  );
  expect(io.exec).toHaveBeenCalledWith("ROLLBACK");
  expect(io.close).toHaveBeenCalled();
  expect(io.remove).not.toHaveBeenCalled();
});

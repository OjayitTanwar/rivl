import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  available: true,
  connections: [] as { keyed: boolean; closed: boolean; commands: string[] }[],
  setKey: vi.fn(),
}));
vi.mock("../src/security/private-files", () => ({
  preparePrivateFiles: async () => {},
}));
vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "after-first-unlock",
  getItemAsync: async () => {
    if (!state.available) throw new Error("keychain unavailable");
    return "ab".repeat(32);
  },
  setItemAsync: state.setKey,
}));
vi.mock("expo-crypto", () => ({}));
vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: async (path: string) => ({
    exists: path.endsWith("rivl-private-v2.db"),
  }),
}));
vi.mock("expo-sqlite", () => ({
  defaultDatabaseDirectory: "file:///Documents/SQLite",
  openDatabaseAsync: async (
    _name: string,
    options: { useNewConnection: boolean },
  ) => {
    if (state.connections.length) expect(options.useNewConnection).toBe(true);
    const connection = {
      keyed: false,
      closed: false,
      commands: [] as string[],
    };
    state.connections.push(connection);
    return {
      execAsync: async (sql: string) => {
        connection.commands.push(sql);
        if (sql.startsWith("PRAGMA key")) connection.keyed = true;
        else if (!connection.keyed) throw new Error("file is not a database");
      },
      getFirstAsync: async (sql: string) => {
        if (sql === "PRAGMA cipher_version") return { cipher_version: "4" };
        if (!connection.keyed) throw new Error("file is not a database");
        return null;
      },
      runAsync: async () => {
        if (!connection.keyed) throw new Error("file is not a database");
      },
      closeAsync: async () => {
        connection.closed = true;
      },
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.connections = [];
  state.available = true;
});

it("keys each atomic write connection after a cold database open", async () => {
  const { database } = await import("../src/storage/database");
  await database.commit({ workout: { state: "recording" } });
  await database.commitSamples(
    "workout",
    [{ t: 1, lat: 1, lng: 2, accuracy: 5, segment: 0 }],
    { workout: { state: "paused" } },
  );
  expect(state.connections).toHaveLength(3);
  for (const connection of state.connections.slice(1)) {
    expect(connection.commands[0]).toMatch(/^PRAGMA key/);
    expect(connection.commands).toContain("BEGIN IMMEDIATE");
    expect(connection.commands).toContain("COMMIT");
    expect(connection.closed).toBe(true);
  }
  expect(state.connections[0]!.closed).toBe(false);
  expect(state.setKey).not.toHaveBeenCalled();
});

it("retries after protected data becomes available without replacing the key", async () => {
  const { database } = await import("../src/storage/database");
  state.available = false;
  await expect(database.commit({ workout: {} })).rejects.toThrow(
    "keychain unavailable",
  );
  expect(state.connections).toHaveLength(0);
  state.available = true;
  await database.commit({ workout: { state: "paused" } });
  expect(state.connections).toHaveLength(2);
  expect(state.setKey).not.toHaveBeenCalled();
});

it("rolls back and closes the dedicated connection when an atomic write fails", async () => {
  const { openEncryptedDatabase, withEncryptedTransaction } =
    await import("../src/storage/encrypted");
  const db = await openEncryptedDatabase();
  await expect(
    withEncryptedTransaction(db, async () => {
      throw new Error("disk full");
    }),
  ).rejects.toThrow("disk full");
  expect(state.connections[1]!.commands).toContain("ROLLBACK");
  expect(state.connections[1]!.commands).not.toContain("COMMIT");
  expect(state.connections[1]!.closed).toBe(true);
  expect(state.connections[0]!.closed).toBe(false);
});

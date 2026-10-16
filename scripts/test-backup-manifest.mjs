import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateManifest,
  verifyManifestFiles,
  sha256,
} from "./backup-manifest.mjs";
const names = [
  "roles.sql",
  "schema.sql",
  "data.sql",
  "managed-schema.sql",
  "history-schema.sql",
  "history-data.sql",
  "inventory.json",
  "checks.json",
];
const manifest = () => ({
  format: 1,
  projectRef: "a".repeat(20),
  createdAt: new Date().toISOString(),
  files: names.map((path) => ({ path, bytes: 0, sha256: "a".repeat(64) })),
  objects: [],
});
test("requires database/auth/storage/history coverage, safe paths and unique entries", () => {
  assert.doesNotThrow(() => validateManifest(manifest()));
  for (const value of [
    { ...manifest(), files: manifest().files.slice(1) },
    { ...manifest(), files: [...manifest().files, manifest().files[0]] },
    {
      ...manifest(),
      files: [
        ...manifest().files,
        { path: "../secret", bytes: 0, sha256: "a".repeat(64) },
      ],
    },
    {
      ...manifest(),
      objects: [
        { bucket: "avatars", name: "person", file: "objects/000000.bin" },
      ],
    },
  ])
    assert.throws(() => validateManifest(value));
});
test("checks actual content and rejects modified backup files", async () => {
  const root = await mkdtemp(join(tmpdir(), "rivl-manifest-test-"));
  try {
    const value = manifest();
    for (const file of value.files) {
      await writeFile(join(root, file.path), "fixture");
      file.bytes = 7;
      file.sha256 = await sha256(join(root, file.path));
    }
    await verifyManifestFiles(root, value);
    await writeFile(join(root, "data.sql"), "changed");
    await assert.rejects(verifyManifestFiles(root, value), /checksum/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

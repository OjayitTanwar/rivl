import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve, sep } from "node:path";
export const BACKUP_FORMAT = 1;
export const MAX_FILES = 10020;
export async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export function validateManifest(value) {
  if (
    !value ||
    value.format !== BACKUP_FORMAT ||
    !/^[a-z]{20}$/.test(value.projectRef) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.files) ||
    value.files.length < 3 ||
    value.files.length > MAX_FILES ||
    !Array.isArray(value.objects) ||
    value.objects.length > 10000
  )
    throw new Error("Invalid backup manifest");
  const paths = new Set();
  for (const file of value.files) {
    if (
      !file ||
      !/^(?:roles|schema|data|history-schema|history-data|managed-schema)\.sql$|^inventory\.json$|^checks\.json$|^objects\/[0-9]{6}\.bin$/.test(
        file.path,
      ) ||
      paths.has(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error("Invalid backup file entry");
    paths.add(file.path);
  }
  for (const required of [
    "roles.sql",
    "schema.sql",
    "data.sql",
    "managed-schema.sql",
    "history-schema.sql",
    "history-data.sql",
    "inventory.json",
    "checks.json",
  ])
    if (!paths.has(required)) throw new Error("Incomplete database backup");
  const objects = new Set();
  for (const object of value.objects) {
    if (
      !object ||
      typeof object.bucket !== "string" ||
      !object.bucket ||
      typeof object.name !== "string" ||
      !object.name ||
      !/^objects\/[0-9]{6}\.bin$/.test(object.file) ||
      !paths.has(object.file) ||
      objects.has(object.file)
    )
      throw new Error("Invalid object inventory");
    objects.add(object.file);
  }
  if (
    [...paths].filter((p) => p.startsWith("objects/")).length !== objects.size
  )
    throw new Error("Uninventoried object file");
  return value;
}
export async function verifyManifestFiles(root, manifest) {
  validateManifest(manifest);
  for (const file of manifest.files) {
    const path = resolve(root, file.path);
    if (!path.startsWith(resolve(root) + sep))
      throw new Error("Unsafe backup path");
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== file.bytes ||
      (await sha256(path)) !== file.sha256
    )
      throw new Error("Backup checksum mismatch");
  }
}

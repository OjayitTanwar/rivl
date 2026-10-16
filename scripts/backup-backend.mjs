#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sha256, validateManifest } from "./backup-manifest.mjs";
const exec = promisify(execFile);
process.umask(0o077);
const CLI_VERSION = "2.75.0";
const MAX_OBJECT = 50 * 1024 * 1024,
  MAX_TOTAL = 250 * 1024 * 1024,
  MAX_ENCRYPTED = 40 * 1024 * 1024;
let work, destination;
const archiveChildren = [];
let archiveTimer;
const required = (name) => {
  if (!process.env[name])
    throw new Error("Missing required backup configuration");
  return process.env[name];
};
const checksSql = `select json_build_object('authUsers',(select count(*)from auth.users),'profiles',(select count(*)from public.profiles),'activities',(select count(*)from public.activities),'tracks',(select count(*)from public.activity_tracks),'routes',(select count(*)from public.routes),'creatorPrograms',(select count(*)from public.creator_training_programs),'orphanProfiles',(select count(*)from public.profiles p left join auth.users u on u.id=p.id where u.id is null));`;
async function checks(db) {
  const result = await exec(
    "psql",
    ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", checksSql],
    {
      env: {
        ...process.env,
        PGDATABASE: db,
        PGOPTIONS:
          "-c default_transaction_read_only=on -c statement_timeout=60000",
      },
      maxBuffer: 100000,
      timeout: 70000,
    },
  );
  return JSON.parse(result.stdout);
}
const inventorySql = `select json_build_object('buckets',coalesce((select json_agg(x order by id)from(select id,name,public,file_size_limit,allowed_mime_types from storage.buckets)x),'[]'::json),'objects',coalesce((select json_agg(x order by bucket_id,name)from(select bucket_id,name,updated_at,metadata from storage.objects order by bucket_id,name limit 10001)x),'[]'::json));`;
async function inventory(db) {
  const result = await exec(
    "psql",
    ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", inventorySql],
    {
      env: {
        ...process.env,
        PGDATABASE: db,
        PGOPTIONS: "-c statement_timeout=60000",
      },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 70000,
    },
  );
  const parsed = JSON.parse(result.stdout);
  if (
    !Array.isArray(parsed.objects) ||
    parsed.objects.length > 10000 ||
    !Array.isArray(parsed.buckets) ||
    parsed.buckets.length > 1000
  )
    throw new Error("Storage inventory bound exceeded");
  return parsed;
}
async function dump(db, name, flags) {
  const file = join(work, name);
  await exec(
    "supabase",
    ["db", "dump", "--db-url", db, "--file", file, ...flags],
    { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 },
  );
  if ((await stat(file)).size > MAX_TOTAL)
    throw new Error("Database dump bound exceeded");
}
async function main() {
  const db = required("BACKUP_DATABASE_URL"),
    key = required("BACKUP_SERVICE_ROLE_KEY"),
    recipient = required("BACKUP_AGE_RECIPIENT");
  const base = new URL(required("BACKUP_SUPABASE_URL"));
  if (
    base.protocol !== "https:" ||
    !/^[a-z]{20}\.supabase\.co$/.test(base.hostname) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    !/^age1[a-z0-9]{58}$/.test(recipient)
  )
    throw new Error("Invalid backup destination/encryption configuration");
  const databaseUrl = new URL(db),
    reference = base.hostname.split(".")[0];
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["require", "verify-ca", "verify-full"].includes(
      databaseUrl.searchParams.get("sslmode"),
    ) ||
    !(
      databaseUrl.hostname === `db.${reference}.supabase.co` ||
      (databaseUrl.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(databaseUrl.username) === `postgres.${reference}`)
    ) ||
    databaseUrl.port === "6543"
  )
    throw new Error("Use the matching project TLS direct/session database URL");
  if ((await exec("supabase", ["--version"])).stdout.trim() !== CLI_VERSION)
    throw new Error("Use the pinned Supabase CLI version");
  await exec("age", ["--version"]);
  work = await mkdtemp(join(tmpdir(), "rivl-backup-"));
  await mkdir(join(work, "objects"));
  const started = new Date().toISOString(),
    before = await inventory(db),
    counts = await checks(db);
  await dump(db, "roles.sql", ["--role-only"]);
  await dump(db, "schema.sql", []);
  await dump(db, "data.sql", [
    "--data-only",
    "--use-copy",
    "--exclude",
    "storage.buckets_vectors,storage.vector_indexes",
  ]);
  await dump(db, "managed-schema.sql", ["--schema", "auth,storage"]);
  await dump(db, "history-schema.sql", ["--schema", "supabase_migrations"]);
  await dump(db, "history-data.sql", [
    "--schema",
    "supabase_migrations",
    "--data-only",
    "--use-copy",
  ]);
  const objects = [];
  let bytes = 0;
  for (const [i, object] of before.objects.entries()) {
    if (
      typeof object.bucket_id !== "string" ||
      !/^[a-zA-Z0-9_.-]+$/.test(object.bucket_id) ||
      [".", ".."].includes(object.bucket_id) ||
      typeof object.name !== "string" ||
      object.name.split("/").some((part) => part === "." || part === "..")
    )
      throw new Error("Invalid Storage row");
    const file = `objects/${String(i).padStart(6, "0")}.bin`;
    const path =
      object.bucket_id.split("/").map(encodeURIComponent).join("/") +
      "/" +
      object.name.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(
      new URL(`storage/v1/object/authenticated/${path}`, base),
      {
        headers: { Authorization: `Bearer ${key}`, apikey: key },
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok || !response.body)
      throw new Error("Storage object unavailable");
    let objectBytes = 0;
    const bounded = new Transform({
      transform(chunk, _, done) {
        objectBytes += chunk.length;
        bytes += chunk.length;
        done(
          objectBytes > MAX_OBJECT || bytes > MAX_TOTAL
            ? new Error("Storage byte bound exceeded")
            : null,
          chunk,
        );
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      bounded,
      createWriteStream(join(work, file), { mode: 0o600, flags: "wx" }),
    );
    const expected = Number(object.metadata?.size);
    if (Number.isFinite(expected) && expected !== objectBytes)
      throw new Error("Storage object size changed");
    objects.push({ bucket: object.bucket_id, name: object.name, file });
  }
  if (JSON.stringify(before) !== JSON.stringify(await inventory(db)))
    throw new Error("Storage changed during backup; retry during maintenance");
  if (JSON.stringify(counts) !== JSON.stringify(await checks(db)))
    throw new Error("Core row counts changed during backup");
  await writeFile(join(work, "checks.json"), JSON.stringify(counts));
  await writeFile(join(work, "inventory.json"), JSON.stringify(before));
  const names = [
    "roles.sql",
    "schema.sql",
    "data.sql",
    "managed-schema.sql",
    "history-schema.sql",
    "history-data.sql",
    "inventory.json",
    "checks.json",
    ...objects.map((o) => o.file),
  ];
  const files = [];
  for (const path of names) {
    const size = (await stat(join(work, path))).size;
    files.push({ path, bytes: size, sha256: await sha256(join(work, path)) });
  }
  if (files.reduce((sum, file) => sum + file.bytes, 0) > MAX_TOTAL)
    throw new Error("Total backup bound exceeded");
  const manifest = validateManifest({
    format: 1,
    projectRef: base.hostname.split(".")[0],
    createdAt: started,
    finishedAt: new Date().toISOString(),
    cliVersion: CLI_VERSION,
    consistency: "independent-logical-dumps-storage-inventory-stable",
    objects,
    files,
  });
  await writeFile(join(work, "manifest.json"), JSON.stringify(manifest));
  const output = resolve(required("BACKUP_OUTPUT_DIR"));
  await mkdir(output, { recursive: true, mode: 0o700 });
  destination = join(output, `rivl-${Date.now()}.tar.age`);
  const tar = spawn("tar", ["-C", work, "-cf", "-", "."], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const age = spawn(
    "age",
    ["--encrypt", "--recipient", recipient, "--output", destination],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  archiveChildren.push(tar, age);
  archiveTimer = setTimeout(
    () => {
      tar.kill("SIGKILL");
      age.kill("SIGKILL");
    },
    10 * 60 * 1000,
  );
  const ended = (child) =>
    new Promise((ok, fail) => {
      child.once("error", fail);
      child.once("exit", (code) =>
        code === 0 ? ok() : fail(new Error("Archive encryption failed")),
      );
    });
  await Promise.all([pipeline(tar.stdout, age.stdin), ended(tar), ended(age)]);
  if ((await stat(destination)).size > MAX_ENCRYPTED)
    throw new Error("Encrypted backup exceeds the 40 MiB storage budget; no partial backup was kept");
  console.log(
    "Encrypted backup prepared. Restore verification is still required.",
  );
}
try {
  await main();
} catch {
  if (destination) await rm(destination, { force: true });
  console.error(
    "Backup failed safely. No complete artifact was produced; inspect configuration and retry.",
  );
  process.exitCode = 1;
} finally {
  if (archiveTimer) clearTimeout(archiveTimer);
  for (const child of archiveChildren) child.kill();
  if (work) await rm(work, { recursive: true, force: true });
}

#!/usr/bin/env node
/** Decrypt and verify only. Never executes restored SQL or writes a server. */
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { validateManifest, verifyManifestFiles } from "./backup-manifest.mjs";
const exec = promisify(execFile);
process.umask(0o077);
let work;
async function boundedCommand(command, args, destination, maximum) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
  const ended = new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? ok() : fail(new Error("Verification command failed")),
    );
  });
  let bytes = 0;
  const timer = setTimeout(() => child.kill("SIGKILL"), 5 * 60 * 1000);
  try {
    await Promise.all([
      ended,
      pipeline(
        child.stdout,
        new Transform({
          transform(chunk, _, done) {
            bytes += chunk.length;
            if (bytes > maximum) child.kill("SIGKILL");
            done(
              bytes > maximum
                ? new Error("Verification byte bound exceeded")
                : null,
              chunk,
            );
          },
        }),
        createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      ),
    ]);
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}
try {
  const archive = process.argv[2],
    identity = process.env.BACKUP_AGE_IDENTITY_FILE;
  if (!archive?.endsWith(".tar.age") || !identity)
    throw new Error("Supply archive and private age identity file");
  work = await mkdtemp(join(tmpdir(), "rivl-verify-"));
  const tar = join(work, "backup.tar"),
    content = join(work, "content");
  await mkdir(content);
  await boundedCommand(
    "age",
    ["--decrypt", "--identity", identity, "--output", "-", archive],
    tar,
    520 * 1024 * 1024,
  );
  const listing = (
    await exec("tar", ["-tf", tar], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 60000,
    })
  ).stdout
    .trim()
    .split("\n");
  if (
    listing.length > 10030 ||
    new Set(listing).size !== listing.length ||
    listing.some(
      (name) =>
        !/^\.(?:\/)?$|^\.\/objects\/$|^\.\/manifest\.json$|^\.\/(?:roles|schema|data|history-schema|history-data|managed-schema)\.sql$|^\.\/inventory\.json$|^\.\/checks\.json$|^\.\/objects\/[0-9]{6}\.bin$/.test(
          name,
        ),
    )
  )
    throw new Error("Unsafe archive members");
  for (const name of listing.filter(
    (entry) => !entry.endsWith("/") && entry !== ".",
  )) {
    const relative = name.slice(2);
    if (relative.startsWith("objects/"))
      await mkdir(join(content, "objects"), { recursive: true });
    // Stream selected members to generated local paths; never trust tar extraction paths.
    await boundedCommand(
      "tar",
      ["-xOf", tar, name],
      join(content, relative),
      relative === "manifest.json" ? 16 * 1024 * 1024 : 512 * 1024 * 1024,
    );
  }
  const manifest = validateManifest(
    JSON.parse(await readFile(join(content, "manifest.json"), "utf8")),
  );
  await verifyManifestFiles(content, manifest);
  const inventory = JSON.parse(
    await readFile(join(content, "inventory.json"), "utf8"),
  );
  if (
    !Array.isArray(inventory.objects) ||
    inventory.objects.length !== manifest.objects.length ||
    manifest.objects.some(
      (o, i) =>
        inventory.objects[i]?.bucket_id !== o.bucket ||
        inventory.objects[i]?.name !== o.name,
    )
  )
    throw new Error("Object inventory mismatch");
  if (process.env.BACKUP_VERIFY_TARGET_DATABASE_URL) {
    const base = new URL(process.env.BACKUP_VERIFY_TARGET_SUPABASE_URL ?? "");
    const key = process.env.BACKUP_VERIFY_TARGET_SERVICE_ROLE_KEY;
    if (
      base.protocol !== "https:" ||
      !/^[a-z]{20}\.supabase\.co$/.test(base.hostname) ||
      base.hostname.startsWith(manifest.projectRef + ".") ||
      base.pathname !== "/" ||
      base.search ||
      base.hash ||
      base.username ||
      base.password ||
      !key
    )
      throw new Error("Use a different disposable target project");
    const query = `select json_build_object('authUsers',(select count(*)from auth.users),'profiles',(select count(*)from public.profiles),'activities',(select count(*)from public.activities),'tracks',(select count(*)from public.activity_tracks),'routes',(select count(*)from public.routes),'creatorPrograms',(select count(*)from public.creator_training_programs),'orphanProfiles',(select count(*)from public.profiles p left join auth.users u on u.id=p.id where u.id is null));`;
    const result = await exec(
      "psql",
      ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query],
      {
        env: {
          ...process.env,
          PGDATABASE: process.env.BACKUP_VERIFY_TARGET_DATABASE_URL,
          PGOPTIONS:
            "-c default_transaction_read_only=on -c statement_timeout=60000",
        },
        maxBuffer: 100000,
        timeout: 70000,
      },
    );
    const expected = JSON.parse(
      await readFile(join(content, "checks.json"), "utf8"),
    );
    if (JSON.stringify(JSON.parse(result.stdout)) !== JSON.stringify(expected))
      throw new Error("Restored row counts/relationships differ");
    const objectsQuery = `select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name)order by bucket_id,name),'[]'::json)from storage.objects;`;
    const objectsResult = await exec(
      "psql",
      ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", objectsQuery],
      {
        env: {
          ...process.env,
          PGDATABASE: process.env.BACKUP_VERIFY_TARGET_DATABASE_URL,
          PGOPTIONS:
            "-c default_transaction_read_only=on -c statement_timeout=60000",
        },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 70000,
      },
    );
    if (
      JSON.stringify(JSON.parse(objectsResult.stdout)) !==
      JSON.stringify(
        manifest.objects.map(({ bucket, name }) => ({ bucket, name })),
      )
    )
      throw new Error("Restored Storage metadata differs");
    for (const object of manifest.objects) {
      if (
        !/^[a-zA-Z0-9_.-]+$/.test(object.bucket) ||
        [".", ".."].includes(object.bucket) ||
        object.name.split("/").some((p) => p === "." || p === "..")
      )
        throw new Error("Unsafe object path");
      const response = await fetch(
        new URL(
          `storage/v1/object/authenticated/${encodeURIComponent(object.bucket)}/${object.name.split("/").map(encodeURIComponent).join("/")}`,
          base,
        ),
        {
          headers: { Authorization: `Bearer ${key}`, apikey: key },
          redirect: "error",
          signal: AbortSignal.timeout(120000),
        },
      );
      if (!response.ok || !response.body)
        throw new Error("Restored Storage object missing");
      const file = manifest.files.find((f) => f.path === object.file),
        hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 50 * 1024 * 1024)
          throw new Error("Restored object bound exceeded");
        hash.update(chunk);
      }
      if (bytes !== file.bytes || hash.digest("hex") !== file.sha256)
        throw new Error("Restored Storage checksum mismatch");
    }
    console.log(
      "Disposable target core row counts, profile ownership and every Storage object checksum match. Login, RLS and worker smoke tests remain required.",
    );
  }
  console.log(
    "Backup decrypts and all database/object checksums match. No database was restored. A disposable hosted restore and login/RLS/Storage smoke test are still required.",
  );
} catch {
  console.error("Backup verification failed. No database was changed.");
  process.exitCode = 1;
} finally {
  if (work) await rm(work, { recursive: true, force: true });
}

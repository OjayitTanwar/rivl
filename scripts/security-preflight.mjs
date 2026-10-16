import { loadProjectEnv } from "@expo/env";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { pinConfiguration } from "../plugins/with-native-security.js";
const failures = [];
const production =
  process.argv.includes("--production") ||
  process.env.EAS_BUILD_PROFILE === "production";
loadProjectEnv(fileURLToPath(new URL("..", import.meta.url)), {
  mode: production ? "production" : "development",
  silent: true,
});
const config = JSON.parse(
  readFileSync(new URL("../app.json", import.meta.url), "utf8"),
).expo;
const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
if (mapboxToken && !mapboxToken.startsWith("pk."))
  failures.push("Mapbox client configuration requires a public pk. token.");
const ignores = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
if (!ignores.includes(".env.*") || !ignores.includes("!.env.example"))
  failures.push(
    "Ignore all real environment files and retain only .env.example.",
  );
// Environment values and local compose overrides must never be committable.
const ignoreLines = new Set(ignores.split("\n").map((line) => line.trim()));
for (const required of [
  ".env",
  ".env.local",
  ".env.production",
  "docker-compose.override.yml",
]) {
  if (!ignoreLines.has(required))
    failures.push(`${required} must be listed in .gitignore.`);
}
// No source file may name a service-role or secret key; those belong in the
// hosted function environment, never in the app or build scripts.
const clientSources = ["app", "src", "plugins"];
const secretKeyPattern = /sb_secret_|service_role|SERVICE_ROLE_KEY/;
for (const dir of clientSources) {
  const root = new URL(`../${dir}/`, import.meta.url);
  const walk = (url) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
      if (entry.isDirectory()) walk(child);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        const text = readFileSync(child, "utf8");
        if (secretKeyPattern.test(text))
          failures.push(
            `${dir}/${entry.name} references a service-role or secret key; keep it server-side.`,
          );
      }
    }
  };
  try {
    walk(root);
  } catch {
    // A missing optional directory is not a security failure.
  }
}
if (
  !config.plugins.some(
    (p) =>
      Array.isArray(p) && p[0] === "expo-sqlite" && p[1].useSQLCipher === true,
  )
)
  failures.push("SQLCipher must be enabled in the native build.");
if (!config.plugins.includes("./plugins/with-native-security"))
  failures.push("The native TLS/backup plugin must be registered.");
for (const [key, value] of Object.entries(process.env)) {
  if (
    key.startsWith("EXPO_PUBLIC_") &&
    (/(SERVICE_ROLE|SECRET|PRIVATE_KEY|PASSWORD)/i.test(key) ||
      value?.startsWith("sb_secret_"))
  )
    failures.push(`${key} must not be bundled in the client.`);
}
if (production) {
  if (process.env.EXPO_PUBLIC_ENABLE_DEMO !== "false")
    failures.push(
      "Production must disable development accounts and simulations.",
    );
  // Native maps use provider defaults. Only validate an explicit custom style
  // for the configured Mapbox fallback; Google-only builds need no style URL.
  const serviceURLs = ["EXPO_PUBLIC_SUPABASE_URL"];
  if (mapboxToken && process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim())
    serviceURLs.push("EXPO_PUBLIC_MAP_STYLE_URL");
  for (const key of serviceURLs) {
    try {
      const u = new URL(process.env[key]);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new Error();
    } catch {
      failures.push(`${key} must be a valid HTTPS service URL.`);
    }
  }
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!key) failures.push("The Supabase publishable key is missing.");
  else if (!key.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (payload.role !== "anon") throw new Error();
    } catch {
      failures.push("Only a publishable or legacy anon key may be bundled.");
    }
  }
  try {
    const pins = pinConfiguration(
      process.env.RIVL_PINNED_HOST,
      process.env.RIVL_TLS_SPKI_PINS,
    );
    if (!pins)
      failures.push(
        "Production needs real current/backup API pins and an operated rotation plan.",
      );
    else if (
      pins.host !== new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname
    )
      failures.push("The pinned hostname must match the API hostname.");
  } catch (error) {
    failures.push(error.message);
  }
}
if (failures.length) {
  for (const message of failures) console.error(message);
  process.exitCode = 1;
} else
  console.log(
    `Security configuration checks passed (${production ? "production" : "development"}). Device/network validation is still required.`,
  );

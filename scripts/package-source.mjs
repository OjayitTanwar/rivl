import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, relative, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const destination = resolve(root, "build/github-source");
if (existsSync(destination)) throw new Error("Source staging directory already exists; choose a fresh release staging directory before packaging.");
mkdirSync(destination, { recursive: true });
const directories = ["app", "src", "assets", "modules", "targets", "plugins", "scripts", "supabase", "tests", "docs", "e2e", ".maestro", ".github"];
const files = ["README.md", "LICENSE", ".gitignore", ".env.example", "package.json", "package-lock.json", "app.json", "app.config.js", "babel.config.js", "metro.config.js", "tsconfig.json", "vitest.config.ts", "playwright.config.ts", "eas.json"];
function copy(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error("Symlinks are not permitted in source releases.");
  const name = relative(root, path);
  if (info.isDirectory()) {
    if (["node_modules", ".git", ".DS_Store"].includes(name.split("/").at(-1))) return;
    for (const child of readdirSync(path)) copy(join(path, child));
    return;
  }
  if (/\.(log|p8|p12|mobileprovision|ipa|apk|aab|db|sqlite|sqlite3)$/.test(name) || name.endsWith(".DS_Store") || name.includes(".env.") && name !== ".env.example") return;
  if (/\.(js|mjs|ts|tsx|json|md|yml|yaml|sh|toml|sql)$/.test(name)) {
    const text = readFileSync(path, "utf8");
    if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sb_secret_[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{35}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(text))
      throw new Error(`Potential credential in ${name}; publication stopped.`);
  }
  const target = join(destination, name);
  mkdirSync(resolve(target, ".."), { recursive: true });
  cpSync(path, target);
}
for (const name of [...directories, ...files]) if (existsSync(join(root, name))) copy(join(root, name));
// The native team is installer-specific; do not publish the workspace team's default.
const appPath = join(destination, "app.json");
const app = JSON.parse(readFileSync(appPath, "utf8"));
delete app.expo.ios.appleTeamId;
writeFileSync(appPath, JSON.stringify(app, null, 2) + "\n");
console.log(`Prepared source only: ${destination}. No env credentials, binaries or native build directories included.`);

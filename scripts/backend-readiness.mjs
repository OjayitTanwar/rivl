import { loadProjectEnv } from "@expo/env";

// Read-only hosted probes. Never sign in, create accounts, fetch rows or print keys.
loadProjectEnv(process.cwd(), { mode: "production", silent: true });
const raw = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
let base;
try {
  base = new URL(raw);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error();
  if (!key || key.startsWith("sb_secret_")) throw new Error();
  if (!key.startsWith("sb_publishable_")) {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (claims.role !== "anon") throw new Error();
  }
} catch {
  console.error("Configure an HTTPS Supabase URL and public anon/publishable key.");
  process.exit(1);
}
const headers = { apikey: key };
if (!key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;
const probes = [
  ["Auth configuration", "/auth/v1/settings", "GET"],
  ...["profiles", "activities", "published_activities", "clubs", "club_members", "comments", "friendships"].map(
    (table) => [table, `/rest/v1/${table}?select=id&limit=0`, "HEAD"],
  ),
];
// Some tables have composite keys; select=* still returns zero rows.
const results = await Promise.all(probes.map(async ([name, path, method]) => {
  if (method === "HEAD") path = path.replace("select=id", "select=*");
  try {
    const response = await fetch(new URL(path, base), {
      method, headers, redirect: "error", signal: AbortSignal.timeout(12000),
    });
    await response.body?.cancel();
    return { name, status: response.status, result: response.ok ? "reachable" :
      [401, 403].includes(response.status) ? "access restricted; authenticated check still needed" : "unavailable" };
  } catch { return { name, result: "unreachable or timed out" }; }
}));
console.log(JSON.stringify({ host: base.hostname, probes: results,
  limitation: "Reachability only. Does not verify login, RLS isolation, migrations, functions, workers, billing or capacity." }, null, 2));
if (results.some((r) => !r.status || ![200, 204, 206, 401, 403].includes(r.status))) process.exitCode = 1;

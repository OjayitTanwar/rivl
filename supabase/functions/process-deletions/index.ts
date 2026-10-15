import { adminClient, deletionPort, json } from "../_shared/admin.ts";
import { processDeletion } from "../_shared/deletion.ts";
async function matches(actual: string, expected: string) {
  const encode = new TextEncoder();
  const [a,b] = await Promise.all([actual,expected].map(value => crypto.subtle.digest("SHA-256", encode.encode(value))));
  const first = new Uint8Array(a), second = new Uint8Array(b);
  let difference = 0; for (let i=0;i<first.length;i++) difference |= first[i]! ^ second[i]!;
  return difference === 0;
}
Deno.serve(async request => {
  const secret = Deno.env.get("RIVL_DELETION_WORKER_SECRET");
  const supplied = request.headers.get("Authorization") ?? "";
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secret || secret.length < 32 || supplied.length > 256 || !await matches(supplied, "Bearer " + secret)) return json({ error: "unauthorized" }, 401);
  try {
    const result = await processDeletion(deletionPort(adminClient()));
    return json({ state: result });
  } catch { return json({ error: "worker_retry_required" }, 503); }
});

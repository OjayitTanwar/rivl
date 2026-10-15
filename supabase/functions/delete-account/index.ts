import { adminClient, deletionPort, json } from "../_shared/admin.ts";
import { processDeletion, recentlyAuthenticated } from "../_shared/deletion.ts";
Deno.serve(async request => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const bearer = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!bearer || bearer.length > 8192) return json({ error: "sign_in_required" }, 401);
  try {
    const admin = adminClient();
    const { data, error } = await admin.auth.getUser(bearer);
    if (error || !data.user) return json({ error: "sign_in_required" }, 401);
    const owner = data.user.id;
    const existing = await admin.from("account_deletions").select("owner_id").eq("owner_id", owner).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) {
      // Decode only after Auth has verified this exact bearer; never trust body-supplied identity.
      const encoded = bearer.split(".")[1];
      if (!encoded) return json({ error: "sign_in_required" }, 401);
      const claims = JSON.parse(atob(encoded.replace(/-/g,"+").replace(/_/g,"/")));
      if (!recentlyAuthenticated(claims)) return json({ error: "reauthentication_required" }, 403);
      const queued = await admin.rpc("queue_account_deletion", { p_owner: owner });
      if (queued.error) throw queued.error;
    }
    const result = await processDeletion(deletionPort(admin), owner);
    return json({ accepted: true, state: result === "completed" ? "completed" : "requested" }, result === "completed" ? 200 : 202);
  } catch {
    return json({ error: "deletion_temporarily_unavailable" }, 503);
  }
});

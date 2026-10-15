import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import type { DeletionPort } from "./deletion.ts";
export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing_server_configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000), redirect: "error" }) } });
}
export function deletionPort(admin: ReturnType<typeof adminClient>): DeletionPort {
  return {
    async claim(owner) {
      const { data, error } = await admin.rpc("claim_account_deletion", { p_owner: owner ?? null });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async leaseValid(job) {
      const { data, error } = await admin.rpc("deletion_lease_valid", { p_owner: job.owner_id, p_lease: job.lease_token });
      if (error) throw error;
      return data === true;
    },
    async media(job) {
      const { data, error } = await admin.rpc("deletion_media", { p_owner: job.owner_id, p_lease: job.lease_token });
      if (error) throw error;
      return (data ?? []).map((row: {name: string}) => row.name);
    },
    async removeMedia(names) {
      const { error } = await admin.storage.from("activity-media").remove(names);
      if (error) throw error;
    },
    async deleteIdentity(owner) {
      const { error } = await admin.auth.admin.deleteUser(owner);
      if (error && error.status !== 404 && error.code !== "user_not_found") throw error;
    },
    async finish(job, success) {
      const { error } = await admin.rpc("finish_account_deletion", { p_owner: job.owner_id, p_lease: job.lease_token, p_success: success });
      if (error) throw error;
    },
  };
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

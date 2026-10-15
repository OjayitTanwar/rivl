import { adminClient, json } from "../_shared/admin.ts";
import { processSegments, type SegmentPort } from "../_shared/segment-verification.ts";
async function matches(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const hashes = await Promise.all([actual,expected].map(value => crypto.subtle.digest("SHA-256",encoder.encode(value))));
  const a = new Uint8Array(hashes[0]!), b = new Uint8Array(hashes[1]!);
  let diff = 0; for (let i=0;i<a.length;i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
Deno.serve(async request => {
  const secret = Deno.env.get("RIVL_SEGMENT_WORKER_SECRET");
  const supplied = request.headers.get("Authorization") ?? "";
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);
  if (!secret || secret.length < 32 || supplied.length > 256 || !await matches(supplied,"Bearer " + secret)) return json({error:"unauthorized"},401);
  try {
    const admin = adminClient();
    const port: SegmentPort = {
      async claim() { const {data,error} = await admin.rpc("claim_segment_job"); if (error) throw error; return data?.[0] ?? null; },
      async input(job) { const {data,error} = await admin.rpc("segment_job_input",{p_activity:job.activity_id,p_lease:job.lease}); if (error) throw error; return data; },
      async complete(job,efforts,algorithm) { const {data,error} = await admin.rpc("complete_segment_job",{p_activity:job.activity_id,p_lease:job.lease,p_revision:job.revision,p_efforts:efforts,p_algorithm:algorithm}); if (error) throw error; return data === true; },
      async retry(job) { const {error} = await admin.rpc("retry_segment_job",{p_activity:job.activity_id,p_lease:job.lease}); if (error) throw error; },
    };
    // One leased activity per request; a scheduler can repeat without an unbounded invocation.
    return json({state:await processSegments(port)});
  } catch { return json({error:"worker_retry_required"},503); }
});

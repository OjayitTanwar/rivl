export interface DeletionJob { owner_id: string; lease_token: string }
export interface DeletionPort {
  claim(owner?: string): Promise<DeletionJob | null>;
  leaseValid(job: DeletionJob): Promise<boolean>;
  media(job: DeletionJob): Promise<string[]>;
  removeMedia(names: string[]): Promise<void>;
  deleteIdentity(owner: string): Promise<void>;
  finish(job: DeletionJob, success: boolean): Promise<void>;
}
export async function processDeletion(port: DeletionPort, owner?: string, clock = Date.now): Promise<"idle" | "completed" | "retry"> {
  const job = await port.claim(owner);
  if (!job) return "idle";
  const deadline = clock() + 45000;
  try {
    while (true) {
      if (clock() >= deadline || !await port.leaseValid(job)) throw new Error("lease_expired");
      const names = await port.media(job);
      if (!names.length) break;
      if (names.some(name => !name.startsWith(job.owner_id + "/"))) throw new Error("invalid_media_owner");
      await port.removeMedia(names);
    }
    if (!await port.leaseValid(job)) throw new Error("lease_expired");
    await port.deleteIdentity(job.owner_id);
    await port.finish(job, true);
    return "completed";
  } catch {
    await port.finish(job, false);
    return "retry";
  }
}
export function recentlyAuthenticated(claims: unknown, now = Date.now()): boolean {
  if (!claims || typeof claims !== "object" || !("amr" in claims) || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((amr: unknown) => {
    if (!amr || typeof amr !== "object" || !("timestamp" in amr) || !("method" in amr)) return false;
    return typeof amr.timestamp === "number" && amr.timestamp * 1000 <= now + 30000 && now - amr.timestamp * 1000 <= 300000 && ["password", "otp", "totp", "oauth"].includes(String(amr.method));
  });
}

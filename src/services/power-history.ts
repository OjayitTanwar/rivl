import { database } from "../storage/database";
import type { Database } from "../storage/port";
import { downloadTrack } from "./remote";
import {
  combinePowerCurves,
  powerCurve,
  type PowerBest,
} from "../domain/power-analysis";
import {
  recordedCyclingPowerCurve,
  RECORDED_POWER_POLICY,
  RECORDED_POWER_WINDOWS,
} from "../domain/power-curve";
import { AppFailure } from "../security/errors";
import type { Activity, Sample } from "../domain/types";
export interface PowerHistoryOptions {
  db?: Database;
  download?: (activity: Activity) => Promise<Sample[]>;
  signal?: AbortSignal;
  canCommit?: () => boolean;
}
export async function historicalPower(
  activities: Activity[],
  owner: string,
  sport: string,
  since: number,
  excludedId: string,
  options: PowerHistoryOptions = {},
): Promise<{ curve: PowerBest[]; count: number; limited: boolean }> {
  const controller = new AbortController();
  let cancelled = false;
  let rejectStopped: (reason: AppFailure) => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    rejectStopped = reject;
  });
  const cancel = () => {
    cancelled = true;
    controller.abort();
    rejectStopped(
      new AppFailure("cancelled", "Power comparison was cancelled."),
    );
  };
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    cancelled = true;
    controller.abort();
    rejectStopped(
      new AppFailure(
        "timeout",
        "Power history took too long to load. Retry when connected.",
        true,
      ),
    );
  }, 30000);
  if (options.signal?.aborted) cancel();
  try {
    return await Promise.race([
      computeHistoricalPower(activities, owner, sport, since, excludedId, {
        ...options,
        signal: controller.signal,
        canCommit: () => !cancelled && options.canCommit?.() !== false,
      }),
      stopped,
    ]);
  } finally {
    cancelled = true;
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
async function computeHistoricalPower(
  activities: Activity[],
  owner: string,
  sport: string,
  since: number,
  excludedId: string,
  options: PowerHistoryOptions = {},
): Promise<{ curve: PowerBest[]; count: number; limited: boolean }> {
  const db = options.db ?? database,
    download =
      options.download ??
      ((activity: Activity) =>
        downloadTrack(activity, {
          signal: options.signal,
          canCommit: options.canCommit,
          cache: false,
        }));
  const check = async () => {
    if (options.signal?.aborted || options.canCommit?.() === false)
      throw new AppFailure("cancelled", "Power comparison was cancelled.");
    if (
      (await db.get<{ userId: string }>("session"))?.userId !== owner ||
      (await db.get<{ userId: string }>("account:cleanup"))?.userId === owner
    )
      throw new AppFailure(
        "auth",
        "Your account changed. Reopen this activity.",
      );
  };
  const readTrack = async (activity: Activity) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectStopped: (reason: AppFailure) => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      rejectStopped = reject;
    });
    const cancel = () =>
      rejectStopped(
        new AppFailure("cancelled", "Power comparison was cancelled."),
      );
    options.signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(
      () =>
        rejectStopped(
          new AppFailure(
            "timeout",
            "Power history took too long to load. Retry when connected.",
            true,
          ),
        ),
      15000,
    );
    try {
      if (options.signal?.aborted) cancel();
      return await Promise.race([
        Promise.resolve().then(() => download(activity)),
        stopped,
      ]);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  };
  const current = activities.find(
    (a) => a.id === excludedId && a.ownerId === owner,
  );
  if (
    !current ||
    current.sport !== sport ||
    current.demo ||
    current.simulated ||
    !Number.isFinite(since) ||
    since < 0
  )
    return { curve: [], count: 0, limited: false };
  await check();
  const eligible = activities
    .filter(
      (a) =>
        a.ownerId === owner &&
        a.sport === sport &&
        !a.demo &&
        !a.simulated &&
        Number.isFinite(a.startedAt) &&
        a.startedAt >= since &&
        a.startedAt < current.startedAt &&
        a.id !== excludedId,
    )
    .sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));
  const selected = eligible.slice(0, 50),
    curves: PowerBest[][] = [];
  for (const activity of selected) {
    await check();
    const key = `power-curve:${owner}:${sport === "ride" ? `raw-v${RECORDED_POWER_POLICY.version}` : "measured-v2"}:${activity.id}:${activity.revision}`;
    let curve = await db.get<PowerBest[]>(key);
    const allowed = sport === "ride" ? RECORDED_POWER_WINDOWS : undefined;
    if (
      curve &&
      (!Array.isArray(curve) ||
        curve.some(
          (p) =>
            !p ||
            !Number.isFinite(p.watts) ||
            p.watts < 0 ||
            p.watts > RECORDED_POWER_POLICY.maxWatts ||
            !Number.isFinite(p.seconds) ||
            (allowed && !allowed.some((s) => s === p.seconds)),
        ))
    )
      curve = null;
    if (!curve) {
      const raw = await readTrack(activity);
      await check();
      curve =
        sport === "ride"
          ? recordedCyclingPowerCurve(activity, raw, owner)
              .windows.filter(
                (p): p is typeof p & { watts: number } => p.watts !== null,
              )
              .map((p) => ({ ...p }))
          : powerCurve(raw);
      await check();
      await db.set(key, curve);
    }
    if (curve.length) curves.push(curve);
  }
  await check();
  return {
    curve: combinePowerCurves(curves),
    count: curves.length,
    limited: eligible.length > 50,
  };
}

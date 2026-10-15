import type { Recording, Sample, Activity, Profile } from "../domain/types";
import type { Database } from "../storage/port";
import { distance, validSample, simplify, routeLines } from "../domain/geo";
import { processActivity } from "../domain/processing";
import { AppFailure } from "../security/errors";
import { textInput, numeric } from "../security/validation";
import { mergeHeartRate } from "./health-enrichment";
import { recordedLaps } from "../domain/activity-ranges";
import { prepareTrackEvidence } from "../domain/community-tracks";
import { CommunityTrackRepository } from "./community-track-repository";
export interface LiveStats {
  distance: number;
  moving: number;
  last: Sample | null;
  accuracy: number | null;
  count: number;
  autoPaused: boolean;
  error: string | null;
  currentSpeed: number;
  ascent: number;
  elevationAnchor: number | null;
}
export const blankStats = (): LiveStats => ({
  distance: 0,
  moving: 0,
  last: null,
  accuracy: null,
  count: 0,
  autoPaused: false,
  error: null,
  currentSpeed: 0,
  ascent: 0,
  elevationAnchor: null,
});
export class RecordingEngine {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private db: Database,
    private enrich: (point: Sample, owner: string) => Sample = (point) => point,
  ) {}
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work);
    this.queue = task.catch(() => {});
    return task;
  }
  async active() {
    return this.db.get<Recording>("recording:active");
  }
  async stats(id: string) {
    return {
      ...blankStats(),
      ...(await this.db.get<LiveStats>("recording:stats:" + id)),
    };
  }
  async begin(recording: Recording) {
    return this.serialize(async () => {
      if (await this.active())
        throw new AppFailure(
          "validation",
          "Finish your current activity first.",
        );
      await this.db.commitSamples(recording.id, [], {
        ["recording:stats:" + recording.id]: blankStats(),
        "recording:active": recording,
      });
    });
  }
  ingest(points: Sample[]) {
    return this.serialize(async () => {
      const rec = await this.active();
      if (!rec || rec.state !== "recording") return;
      const stats = await this.stats(rec.id),
        accepted: Sample[] = [];
      for (const raw of [...points].sort((a, b) => a.t - b.t)) {
        const p = { ...this.enrich(raw, rec.ownerId), segment: rec.segment };
        if (p.t < (rec.acceptAfter ?? rec.startedAt)) continue;
        if (stats.last && p.t <= stats.last.t) continue;
        if (!validSample(p)) continue;
        const prev = stats.last,
          dt = prev ? (p.t - prev.t) / 1000 : 0,
          d = prev ? distance(prev, p) : 0,
          max = { run: 12, ride: 35, walk: 4, hike: 6 }[rec.sport];
        if (prev && dt > 30 && prev.segment === p.segment) {
          rec.segment++;
          p.segment = rec.segment;
        }
        if (
          prev &&
          prev.segment === p.segment &&
          dt > 0 &&
          dt <= 30 &&
          d / dt > max
        )
          continue;
        const threshold =
          rec.sport === "ride" ? 1 : rec.sport === "run" ? 0.6 : 0.35;
        stats.autoPaused = rec.autoPause && !!prev && d / (dt || 1) < threshold;
        if (
          prev &&
          prev.segment === p.segment &&
          dt > 0 &&
          dt <= 30 &&
          d / dt >= threshold
        ) {
          stats.distance += d;
          stats.moving += dt;
          stats.currentSpeed = d / dt;
          if (p.altitude !== undefined) {
            if (
              stats.elevationAnchor !== null &&
              p.altitude - stats.elevationAnchor >= 3
            )
              stats.ascent += p.altitude - stats.elevationAnchor;
            if (
              stats.elevationAnchor === null ||
              Math.abs(p.altitude - stats.elevationAnchor) >= 3
            )
              stats.elevationAnchor = p.altitude;
          }
        } else {
          stats.currentSpeed = 0;
          if (!prev || prev.segment !== p.segment)
            stats.elevationAnchor = p.altitude ?? null;
        }
        stats.last = p;
        stats.count++;
        stats.accuracy = p.accuracy;
        accepted.push(p);
      }
      if (accepted.length) {
        stats.error = null;
        await this.db.commitSamples(rec.id, accepted, {
          ["recording:stats:" + rec.id]: stats,
          "recording:active": rec,
        });
      }
    });
  }
  async reportError(message: string) {
    return this.serialize(async () => {
      const rec = await this.active();
      if (rec)
        await this.db.set("recording:stats:" + rec.id, {
          ...(await this.stats(rec.id)),
          error: message,
        });
    });
  }
  async markLap() {
    return this.serialize(async () => {
      const rec = await this.active();
      if (!rec || rec.state !== "recording")
        throw new AppFailure(
          "validation",
          "Resume recording before marking a lap.",
        );
      const stats = await this.stats(rec.id),
        last = stats.last?.t;
      const previous = rec.lapTimes?.at(-1) ?? rec.startedAt;
      if (!last || last <= previous + 1000)
        throw new AppFailure(
          "validation",
          "Wait for another GPS point before marking a lap.",
        );
      if ((rec.lapTimes?.length ?? 0) >= 1000)
        throw new AppFailure(
          "validation",
          "This recording already has 1,000 laps.",
        );
      await this.db.commitSamples(rec.id, [], {
        "recording:active": {
          ...rec,
          lapTimes: [...(rec.lapTimes ?? []), last],
        },
      });
    });
  }
  async pause() {
    return this.serialize(async () => {
      const rec = await this.active();
      if (rec && rec.state === "recording")
        await this.db.commitSamples(rec.id, [], {
          "recording:active": { ...rec, state: "paused" },
          ["recording:stats:" + rec.id]: {
            ...(await this.stats(rec.id)),
            currentSpeed: 0,
            autoPaused: false,
          },
        });
    });
  }
  async resume() {
    return this.serialize(async () => {
      const rec = await this.active();
      if (rec?.state === "paused")
        await this.db.commitSamples(rec.id, [], {
          "recording:active": {
            ...rec,
            state: "recording",
            segment: rec.segment + 1,
            acceptAfter: rec.simulation ? rec.startedAt : Date.now(),
          },
          ["recording:stats:" + rec.id]: {
            ...(await this.stats(rec.id)),
            currentSpeed: 0,
            autoPaused: false,
            error: null,
          },
        });
    });
  }
  async markSaving() {
    return this.serialize(async () => {
      const rec = await this.active();
      if (rec) {
        const stats = await this.stats(rec.id);
        await this.db.set("recording:active", {
          ...rec,
          state: "saving",
          savedAt:
            rec.savedAt ??
            (rec.simulation ? (stats.last?.t ?? Date.now()) : Date.now()),
        });
      }
    });
  }
  async save(
    profile: Profile,
    title: string,
    note: string,
    rpe: number,
    sensorReadings: { t: number; hr: number }[] = [],
  ): Promise<Activity> {
    return this.serialize(async () => {
      const rec = await this.active();
      if (!rec) throw new AppFailure("validation", "No active recording.");
      if (rec.ownerId !== profile.id)
        throw new AppFailure(
          "validation",
          "This recording belongs to another athlete.",
        );
      title =
        textInput(title, "Activity title", 200, false) || "My " + rec.sport;
      note = textInput(note, "Activity note", 10000, false);
      numeric(rpe, "Perceived effort", 1, 10);
      if (!Number.isInteger(rpe))
        throw new AppFailure(
          "validation",
          "Perceived effort must be a whole number.",
        );
      const raw = mergeHeartRate(await this.db.samples(rec.id), sensorReadings);
      if (raw.length < 2)
        throw new AppFailure(
          "validation",
          "Wait for at least two GPS samples before saving.",
        );
      if (sensorReadings.length) await this.db.appendSamples(rec.id, raw);
      const endedAt =
          rec.savedAt ?? (rec.simulation ? raw[raw.length - 1]!.t : Date.now()),
        summary = processActivity(
          raw,
          rec.sport,
          rec.startedAt,
          endedAt,
          profile.maxHR,
          rpe,
          profile.hrZoneThresholds,
        ),
        route = routeLines(raw).flatMap((line) => simplify(line, 8));
      summary.laps = recordedLaps(
        raw,
        rec.lapTimes ?? [],
        rec.sport,
        profile.maxHR,
      );
      const a: Activity = {
        id: rec.id,
        ownerId: rec.ownerId,
        title,
        sport: rec.sport,
        startedAt: rec.startedAt,
        endedAt,
        summary,
        route,
        visibility: profile.visibility,
        note,
        rpe,
        sync: "pending",
        revision: 1,
        demo: rec.simulation,
        simulated: rec.simulation,
        photos: [],
      };
      const prepared = prepareTrackEvidence(
        a,
        raw,
        profile.id,
        "device-gps",
        profile.privacyZones,
      );
      const contribution = prepared.evidence
        ? await new CommunityTrackRepository(this.db).prepareForCommit(
            profile.id,
            prepared.evidence,
          )
        : {};
      await this.db.commit(
        { ["activity:" + a.ownerId + ":" + a.id]: a, ...contribution },
        ["recording:active"],
      );
      return a;
    });
  }
  async discard() {
    return this.serialize(async () => {
      const rec = await this.active();
      if (rec) {
        await this.db.remove("recording:active");
        await this.db.deleteSamples(rec.id);
        await this.db.remove("recording:stats:" + rec.id);
      }
    });
  }
}

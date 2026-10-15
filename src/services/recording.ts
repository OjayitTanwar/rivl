import { AppFailure, userMessage } from "../security/errors";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Crypto from "expo-crypto";
import { AppState, Platform } from "react-native";
import type { Sample, Sport, Profile } from "../domain/types";
import { database } from "../storage/database";
import { RecordingEngine } from "./recorder-engine";
import { fixtureTrack } from "./fixture-track";
import { capture } from "./telemetry";
import { sensorReadings } from "../domain/sensor-measurements";
export const engine = new RecordingEngine(database, (point, owner) => ({
  ...point,
  ...sensorReadings.at(owner, point.t),
}));
const TASK = "rivl-background-location-v1";
let watch: Location.LocationSubscription | null = null;
let simulation: ReturnType<typeof setInterval> | null = null;
let simulationIndex = 0;
let simulationTrack: Sample[] = [];
let sourceStart: Promise<void> | null = null;
let sourceGeneration = 0;
export type RecordingStartStage = "permission" | "starting";

async function deadline<T>(
  work: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AppFailure("timeout", message, true)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function requireLocation() {
  const enabled = await deadline(
    Location.hasServicesEnabledAsync(),
    8000,
    "Location Services didn’t respond. Check your phone’s location settings and try again.",
  );
  if (!enabled)
    throw new AppFailure(
      "validation",
      "Location Services are off. Turn them on in your phone’s Settings, then try again.",
    );
  const existing = await deadline(
    Location.getForegroundPermissionsAsync(),
    8000,
    "Location permission couldn’t be checked. Open Settings and try again.",
  );
  const permission =
    existing.granted || !existing.canAskAgain
      ? existing
      : await deadline(
          Location.requestForegroundPermissionsAsync(),
          45000,
          "Location permission is still waiting. Allow location in Settings, then try again.",
        );
  if (!permission.granted)
    throw new AppFailure(
      "validation",
      "Allow location while using RIVL in Settings to record your workout. Turn on Precise Location for an accurate route.",
    );
  if (Platform.OS === "ios" && permission.ios?.accuracy === "reduced")
    throw new AppFailure(
      "validation",
      "Precise Location is off. Turn it on for RIVL in Settings to measure distance and pace accurately.",
    );
  if (Platform.OS !== "web" && AppState.currentState !== "active") {
    let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
    try {
      // Permission sheets can resolve just before iOS sends its foreground event.
      await deadline(
        new Promise<void>((resolve) => {
          subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") resolve();
          });
          if (AppState.currentState === "active") resolve();
        }),
        3000,
        "Return to RIVL and tap Start to begin recording.",
      );
    } finally {
      subscription?.remove();
    }
  }
}

function locationFailure(error: unknown): AppFailure {
  if (error instanceof AppFailure) return error;
  const message = error instanceof Error ? error.message : "";
  if (/permission|unauthorized|denied/i.test(message))
    return new AppFailure(
      "validation",
      "RIVL can’t access your location. Allow location and Precise Location in Settings, then resume.",
    );
  if (/background|task|service|foreground/i.test(message))
    return new AppFailure(
      "unknown",
      "The GPS recorder couldn’t start. Keep RIVL open and try again. Your saved workouts are safe.",
      true,
    );
  return new AppFailure(
    "unknown",
    "GPS couldn’t start. Check Location Services in Settings, then try again.",
    true,
  );
}
const toSample = (l: Location.LocationObject): Sample => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  t: l.timestamp,
  accuracy: l.coords.accuracy ?? 100,
  altitude: l.coords.altitude ?? undefined,
  segment: 0,
});
if (Platform.OS !== "web" && !TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TASK,
    async ({ data, error }) => {
      if (error) {
        capture(error, { service: "background-location" });
        await engine
          .reportError(
            "GPS is unavailable. Check location permissions, then pause and resume to retry.",
          )
          .catch(capture);
        return;
      }
      if (data)
        try {
          await engine.ingest(data.locations.map(toSample));
        } catch (e) {
          capture(e, { service: "recording-write" });
        }
    },
  );
export async function startRecording(
  profile: Profile,
  sport: Sport,
  simulate = false,
  ghostId?: string,
  onStage?: (stage: RecordingStartStage) => void,
) {
  if (await engine.active())
    throw new AppFailure(
      "validation",
      "Finish or resume your current workout first.",
    );
  if (sourceStart)
    throw new AppFailure(
      "timeout",
      "GPS is still unresponsive. Close RIVL from the app switcher and reopen it before trying again. Your saved workouts stay on this device.",
      true,
    );
  if (!simulate) {
    onStage?.("permission");
    await requireLocation().catch((error) => {
      throw locationFailure(error);
    });
  }
  onStage?.("starting");
  const rec = {
    id: Crypto.randomUUID(),
    ownerId: profile.id,
    sport,
    startedAt: Date.now(),
    state: "recording" as const,
    segment: 0,
    autoPause: profile.autoPause,
    simulation: simulate,
    ghostId,
  };
  await engine.begin(rec);
  try {
    await attachRecorder(profile.id);
  } catch (error) {
    await engine.pause();
    await engine.reportError(userMessage(error));
    throw error;
  }
  return rec;
}
export async function attachRecorder(ownerId: string) {
  if (!sourceStart) {
    const generation = sourceGeneration;
    sourceStart = connectSource(ownerId, generation).finally(() => {
      sourceStart = null;
    });
  }
  try {
    await deadline(
      sourceStart,
      12000,
      "GPS took too long to start. Your workout is paused. If Resume is still blocked, close RIVL from the app switcher and reopen it. Your recorded points stay on this device.",
    );
  } catch (error) {
    throw locationFailure(error);
  }
}
async function connectSource(ownerId: string, generation: number) {
  const rec = await engine.active();
  if (rec && rec.ownerId !== ownerId)
    throw new AppFailure(
      "validation",
      "Sign in to the athlete who owns this recording to resume it.",
    );
  if (!rec || rec.state !== "recording" || generation !== sourceGeneration)
    return;
  if (rec.simulation) {
    if (simulation) return;
    const saved = await engine.stats(rec.id);
    simulationTrack = fixtureTrack(rec.startedAt, 601, 0, 310);
    simulationIndex = saved.count;
    simulation = setInterval(() => {
      const batch = simulationTrack.slice(simulationIndex, simulationIndex + 4);
      simulationIndex += 4;
      if (batch.length) void engine.ingest(batch).catch(capture);
    }, 350);
    return;
  }
  if (Platform.OS === "web") {
    watch?.remove();
    watch = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 3,
      },
      (l) => {
        void engine.ingest([toSample(l)]).catch(capture);
      },
    );
  } else if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) {
    if (generation !== sourceGeneration) return;
    // A user-started workout uses When In Use plus iOS background mode or Android’s visible foreground service.
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 3,
      timeInterval: 1000,
      deferredUpdatesInterval: 5000,
      deferredUpdatesDistance: 0,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "RIVL is recording",
        notificationBody: "Your route is saved on this device as you move.",
        notificationColor: "#FF4B35",
        killServiceOnDestroy: false,
      },
    });
  }
  const current = await engine.active();
  if (
    generation !== sourceGeneration ||
    current?.id !== rec.id ||
    current.state !== "recording"
  )
    await stopSource();
}
export async function recoverRecording(ownerId: string) {
  const rec = await engine.active();
  if (!rec || rec.ownerId !== ownerId || rec.state !== "recording") return;
  try {
    await attachRecorder(ownerId);
  } catch (error) {
    await engine.pause();
    await engine.reportError(userMessage(error));
    capture(error, { service: "recording-recovery" });
  }
}
export async function stopSource() {
  sourceGeneration++;
  watch?.remove();
  watch = null;
  if (simulation) {
    clearInterval(simulation);
    simulation = null;
  }
  if (
    Platform.OS !== "web" &&
    (await deadline(
      Location.hasStartedLocationUpdatesAsync(TASK),
      8000,
      "GPS didn’t respond. Your workout is paused safely; keep RIVL open and retry.",
    ))
  )
    await deadline(
      Location.stopLocationUpdatesAsync(TASK),
      8000,
      "GPS is still stopping. Your workout data is safe; keep RIVL open and retry.",
    );
}
export async function pauseRecording() {
  await engine.pause();
  await stopSource();
}
export async function resumeRecording(ownerId: string) {
  if (sourceStart)
    throw new AppFailure(
      "timeout",
      "GPS is still unresponsive. Close RIVL from the app switcher and reopen it, then resume your paused workout. Your recorded points stay on this device.",
      true,
    );
  const rec = await engine.active();
  if (rec && rec.ownerId !== ownerId)
    throw new AppFailure(
      "validation",
      "This recording belongs to another athlete.",
    );
  if (!rec || rec.state !== "paused")
    throw new AppFailure("validation", "There is no paused workout to resume.");
  if (!rec.simulation)
    await requireLocation().catch((error) => {
      throw locationFailure(error);
    });
  await engine.resume();
  try {
    await attachRecorder(ownerId);
  } catch (error) {
    await engine.pause();
    await engine.reportError(userMessage(error));
    throw error;
  }
}
export async function finishRecording() {
  await engine.markSaving();
  await stopSource();
}
export async function discardRecording() {
  await stopSource();
  await engine.discard();
}

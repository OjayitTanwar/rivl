import { database } from "../storage/database";
import { useEffect } from "react";
import { Alert, AppState, Platform } from "react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useStore } from "./store";
import { motionBridge } from "../services/motion";
import {
  ExerciseDetector,
  exerciseMotionMatches,
  type MotionSignal,
} from "../domain/exercise-detection";
import {
  autoRecordPreferences,
  onAutoRecordChange,
} from "../services/auto-record-preferences";
import { engine, startRecording } from "../services/recording";
import { userMessage } from "../security/errors";

export function AutomaticRecorder() {
  const { profile } = useStore();
  useEffect(() => {
    if (!profile || profile.demo || Platform.OS === "web") return;
    let alive = true,
      generation = 0,
      busy = false;
    let watcher: Location.LocationSubscription | null = null;
    let detector: ExerciseDetector | null = null;
    let nextDetectionAt = 0;
    let motionSignal: MotionSignal | null = null;
    let motionListener: { remove(): void } | null = null;
    const stop = () => {
      generation++;
      watcher?.remove();
      watcher = null;
      detector?.reset();
      motionSignal = null;
      motionListener?.remove();
      motionListener = null;
      void motionBridge?.stop().catch(() => {});
    };
    const check = async () => {
      if (!alive || busy) return;
      busy = true;
      const token = generation;
      try {
        if (await database.get("account:cleanup")) {
          stop();
          return;
        }
        const prefs = await autoRecordPreferences(profile.id);
        const active = await engine.active();
        if (!alive || token !== generation) return;
        if (active) nextDetectionAt = Date.now() + 120000;
        if (
          !prefs.enabled ||
          active ||
          Date.now() < nextDetectionAt ||
          AppState.currentState !== "active"
        ) {
          stop();
          return;
        }
        if (watcher) return;
        const permission = await Location.getForegroundPermissionsAsync();
        if (
          !alive ||
          token !== generation ||
          !permission.granted ||
          permission.ios?.accuracy === "reduced"
        )
          return;
        if (Platform.OS === "ios") {
          if (!motionBridge) return;
          motionListener = motionBridge.addListener("activity", (signal) => {
            motionSignal = signal;
          });
          const started = await motionBridge.start();
          if (!started || !alive || token !== generation) {
            stop();
            return;
          }
        }
        detector = new ExerciseDetector(prefs.sport);
        let processing = false;
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000,
            distanceInterval: 8,
          },
          async (location) => {
            if (
              processing ||
              !alive ||
              token !== generation ||
              AppState.currentState !== "active"
            )
              return;
            processing = true;
            try {
              if (location.mocked) {
                detector?.reset();
                return;
              }
              if (await engine.active()) {
                stop();
                return;
              }
              if (!alive || token !== generation) return;
              if (
                Platform.OS === "ios" &&
                !exerciseMotionMatches(prefs.sport, motionSignal)
              ) {
                detector?.reset();
                return;
              }
              const confirmed = detector?.push({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
                t: location.timestamp,
                accuracy: location.coords.accuracy ?? 100,
                segment: 0,
              });
              if (!confirmed) return;
              if (await database.get("account:cleanup")) {
                stop();
                return;
              }
              const current = await autoRecordPreferences(profile.id);
              if (
                !current.enabled ||
                current.sport !== prefs.sport ||
                !alive ||
                token !== generation
              )
                return;
              stop();
              try {
                await startRecording(profile, prefs.sport);
                Alert.alert(
                  "Recording started",
                  `RIVL detected sustained movement in ${prefs.sport} mode. Review the activity before saving.`,
                  [
                    {
                      text: "View recording",
                      onPress: () => router.navigate("/record"),
                    },
                  ],
                );
              } catch (error) {
                // A failed start may leave a safely paused recording; never discard it.
                if (alive)
                  Alert.alert(
                    "Automatic start needs attention",
                    userMessage(error),
                  );
              }
            } catch {
              stop();
            } finally {
              processing = false;
            }
          },
        );
        if (!alive || token !== generation) subscription.remove();
        else watcher = subscription;
      } catch {
        stop();
      } finally {
        busy = false;
      }
    };
    const unsubscribe = onAutoRecordChange(() => {
      stop();
      void check();
    });
    const state = AppState.addEventListener("change", () => {
      stop();
      void check();
    });
    const timer = setInterval(() => void check(), 15000);
    void check();
    return () => {
      alive = false;
      stop();
      clearInterval(timer);
      state.remove();
      unsubscribe();
    };
  }, [profile]);
  return null;
}

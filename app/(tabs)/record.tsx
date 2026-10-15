import { gearRepository } from "../../src/services/gear";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ActionSheetIOS,
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  AppState,
  Linking,
  Keyboard,
  Platform,
  ScrollView,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import * as Location from "expo-location";
import {
  Map,
  Pause,
  Play,
  Square,
  Gauge,
  Footprints,
  Bike,
  Mountain,
  ChevronDown,
  Settings2,
  Flag,
  Maximize2,
} from "lucide-react-native";
import type {
  Coordinate,
  Recording,
  Sample,
  Sport,
} from "../../src/domain/types";
import { useStore } from "../../src/state/store";
import {
  Button,
  Field,
  Metric,
  Row,
  Segmented,
  Stack,
  Txt,
  IconButton,
  Notice,
} from "../../src/ui/primitives";
import { brand, useTheme } from "../../src/ui/theme";
import RouteMap from "../../src/ui/RouteMap";
import {
  engine,
  startRecording,
  pauseRecording,
  resumeRecording,
  finishRecording,
  discardRecording,
  recoverRecording,
  type RecordingStartStage,
} from "../../src/services/recording";
import { blankStats, type LiveStats } from "../../src/services/recorder-engine";
import { database } from "../../src/storage/database";
import { simplify, routeLines } from "../../src/domain/geo";
import { km, duration, pace, speed, speedLabel } from "../../src/domain/format";
import { ghostDelta } from "../../src/domain/competition";
import { health } from "../../src/services/health";
import { config } from "../../src/services/config";
import { AppFailure, userMessage } from "../../src/security/errors";
import { useFullScreenLoading } from "../../src/ui/loading-state";

const sports = (["run", "ride", "walk", "hike"] as Sport[]).map((value) => ({
  value,
  label: value[0]!.toUpperCase() + value.slice(1),
}));

export default function Record() {
  const { profile, activities, routes, saveActivity } = useStore();
  const { c } = useTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset =
    height > width
      ? Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0)
      : insets.top;
  const [sheetHeight, setSheetHeight] = useState(190);
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ ghost?: string; route?: string }>();
  const [sport, setSport] = useState<Sport>("run");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [stats, setStats] = useState<LiveStats>(blankStats);
  const [route, setRoute] = useState<Sample[]>([]);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [stage, setStage] = useState<RecordingStartStage | null>(null);
  const [error, setError] = useState("");
  const [locationGranted, setLocationGranted] = useState(false);
  const [previewLocation, setPreviewLocation] = useState<Coordinate>();
  const [simulate, setSimulate] = useState(false);
  const [options, setOptions] = useState(false);
  const [details, setDetails] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [rpe, setRpe] = useState("5");
  const [now, setNow] = useState(Date.now());
  const preview = useRef({
    id: "",
    after: -1,
    points: [] as Sample[],
    updated: 0,
  });
  const reloading = useRef<Promise<void> | null>(null);
  const actionLock = useRef(false);
  const recoveryLock = useRef(true);
  useFullScreenLoading(recovering, "Restoring your recording…");
  useFullScreenLoading(
    loadingLabel !== null,
    stage === "permission"
      ? "Checking location permission…"
      : stage === "starting"
        ? "Starting GPS…"
        : (loadingLabel ?? "Preparing your workout…"),
  );
  const ghost = activities.find((a) => a.id === params.ghost);
  const plannedRoute = routes.find((r) => r.id === params.route);

  const reload = useCallback(() => {
    if (!reloading.current) {
      reloading.current = (async () => {
        const active = await engine.active();
        if (active && active.ownerId !== profile?.id)
          throw new AppFailure(
            "auth",
            "This recording belongs to another account. Sign in to that account to finish it.",
          );
        setRecording(active);
        if (!active) return;
        setStats(await engine.stats(active.id));
        if (preview.current.id !== active.id)
          preview.current = {
            id: active.id,
            after: -1,
            points: [],
            updated: 0,
          };
        if (
          Date.now() - preview.current.updated < 3000 &&
          active.state !== "saving"
        )
          return;
        preview.current.updated = Date.now();
        const batch = await database.samplesSince(
          active.id,
          preview.current.after,
          1000,
        );
        if (!batch.length) return;
        preview.current.after = batch[batch.length - 1]!.t;
        let points = routeLines([...preview.current.points, ...batch]).flatMap(
          (line) => simplify(line, 10),
        );
        if (points.length > 1600)
          points = points.filter(
            (_, i) => i % 2 === 0 || i === points.length - 1,
          );
        preview.current.points = points;
        setRoute(points);
      })().finally(() => {
        reloading.current = null;
      });
    }
    return reloading.current;
  }, [profile?.id]);

  useEffect(() => {
    let alive = true;
    recoveryLock.current = !!profile?.id;
    setRecovering(!!profile?.id);
    if (profile?.id)
      void recoverRecording(profile.id)
        .then(reload)
        .catch((e) => {
          if (alive) setError(userMessage(e));
        })
        .finally(() => {
          if (alive) {
            recoveryLock.current = false;
            setRecovering(false);
          }
        });
    return () => {
      alive = false;
    };
  }, [profile?.id, reload]);

  useEffect(() => {
    if (!focused || !profile?.id) return;
    let alive = true;
    const refreshPermission = () => {
      void Location.getForegroundPermissionsAsync()
        .then((p) => {
          if (alive) setLocationGranted(p.granted);
          if (p.granted)
            void Location.getLastKnownPositionAsync({ maxAge: 60000 })
              .then(
                (position) =>
                  position ??
                  Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                  }),
              )
              .then((position) => {
                if (alive && position)
                  setPreviewLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  });
              })
              .catch(() => {});
        })
        .catch(() => {});
    };
    refreshPermission();
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshPermission();
        void recoverRecording(profile.id)
          .then(reload)
          .catch((e) => setError(userMessage(e)));
      }
    });
    const memory = AppState.addEventListener("memoryWarning", () => {
      preview.current = { id: "", after: -1, points: [], updated: 0 };
      setRoute([]);
    });
    const timer = setInterval(() => {
      if (AppState.currentState !== "active") return;
      setNow(Date.now());
      void reload().catch((e) => setError(userMessage(e)));
    }, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      app.remove();
      memory.remove();
    };
  }, [focused, profile?.id, reload]);

  async function action(work: () => Promise<unknown>, label?: string) {
    if (actionLock.current || recoveryLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setLoadingLabel(label ?? null);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      await reload().catch((e) => setError(userMessage(e)));
      setStage(null);
      setLoadingLabel(null);
      setBusy(false);
      actionLock.current = false;
    }
  }

  function discard() {
    Alert.alert(
      "Discard workout?",
      "The unsaved route will be removed from this device.",
      [
        { text: "Keep workout", style: "cancel" },
        {
          text: "Discard recording",
          style: "destructive",
          onPress: () =>
            void action(async () => {
              await discardRecording();
              setRoute([]);
              setStats(blankStats());
              setTitle("");
              setNote("");
            }),
        },
      ],
    );
  }

  async function save() {
    if (!profile || !recording)
      throw new AppFailure(
        "auth",
        "Sign in again to save this workout. Its route is safe on this device.",
      );
    const effort = Number(rpe);
    if (!Number.isInteger(effort) || effort < 1 || effort > 10)
      throw new AppFailure(
        "validation",
        "Choose a whole-number effort between 1 and 10.",
      );
    let readings: { t: number; hr: number }[] = [];
    if (!recording.simulation && (await database.get("health:" + profile.id))) {
      try {
        readings = await health.heartRate(
          recording.startedAt,
          recording.savedAt ?? Date.now(),
        );
      } catch {
        /* Optional health permission must not prevent saving the GPS workout. */
      }
    }
    const activity = await engine.save(
      profile,
      title || "My " + recording.sport,
      note,
      effort,
      readings,
    );
    await saveActivity(activity);
    let gearWarning = false;
    try {
      await gearRepository.assignDefault(activity);
    } catch {
      gearWarning = true;
    }
    setRecording(null);
    setStats(blankStats());
    setRoute([]);
    setTitle("");
    setNote("");
    router.push({
      pathname: "/activity/[id]",
      params: {
        id: activity.id,
        completed: "true",
        gearWarning: gearWarning ? "1" : "",
      },
    });
  }

  const elapsed = recording
    ? Math.max(
        0,
        ((recording.savedAt ??
          (recording.simulation
            ? (stats.last?.t ?? recording.startedAt)
            : now)) -
          recording.startedAt) /
          1000,
      )
    : 0;
  const riding = (recording?.sport ?? sport) === "ride";
  const saving = recording?.state === "saving";
  const delta = ghost ? ghostDelta(stats.distance, stats.moving, ghost) : null;
  const noFix =
    recording?.state === "recording" &&
    !recording.simulation &&
    stats.count === 0;
  const signalLost =
    recording?.state === "recording" &&
    !recording.simulation &&
    !!stats.last &&
    now - stats.last.t > 30000;
  const currentSpeed =
    recording?.state === "recording" && !signalLost ? stats.currentSpeed : 0;
  const status = saving
    ? "Workout complete"
    : recording?.state === "paused"
      ? "Paused"
      : noFix || signalLost
        ? "Acquiring GPS"
        : stats.autoPaused
          ? "Auto-paused"
          : "Recording";
  const liveError = error || stats.error;
  const startLabel =
    stage === "permission"
      ? "Checking location…"
      : stage === "starting"
        ? "Starting GPS…"
        : simulate
          ? "Start simulated activity"
          : "Start recording";
  const ActiveSportIcon =
    (recording?.sport ?? sport) === "ride"
      ? Bike
      : (recording?.sport ?? sport) === "hike"
        ? Mountain
        : Footprints;
  const chooseSport = () => {
    if (recording) return;
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Choose activity",
          options: [...sports.map((s) => s.label), "Cancel"],
          cancelButtonIndex: sports.length,
        },
        (i) => {
          if (sports[i]) setSport(sports[i]!.value);
        },
      );
    else setOptions(true);
  };
  const begin = () =>
    action(async () => {
      if (!profile)
        throw new AppFailure("auth", "Sign in before starting a workout.");
      await startRecording(profile, sport, simulate, ghost?.id, setStage);
      if (!simulate) setLocationGranted(true);
    }, "Starting your recording…");
  const finish = () => {
    if (stats.count < 2)
      Alert.alert(
        "No route yet",
        "GPS hasn’t collected enough points to save a workout. Move outdoors and wait for a signal, or discard this attempt.",
        [
          { text: "Keep recording", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: discard },
        ],
      );
    else void action(finishRecording, "Preparing your workout review…");
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        <RouteMap
          points={route}
          lines={routeLines(route)}
          center={route.at(-1) ?? previewLocation}
          reference={plannedRoute?.points ?? ghost?.route}
          height={Math.max(220, height - sheetHeight)}
          controlsTop={topInset + 64}
          borderRadius={0}
          showUserLocation={locationGranted && !simulate}
          autoFit={saving}
          followUser={
            locationGranted && !simulate && !saving && !plannedRoute && !ghost
          }
        />
        <Row
          between
          style={{
            position: "absolute",
            top: topInset + 8,
            left: 16,
            right: 16,
          }}
        >
          <IconButton
            label="Close recording screen"
            onPress={() => router.navigate("/")}
          >
            <ChevronDown size={25} color={c.text} />
          </IconButton>
          <IconButton
            label="Recording settings"
            onPress={() => setOptions(true)}
          >
            <Settings2 size={22} color={c.text} />
          </IconButton>
        </Row>
        {!saving && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand workout stats"
            onPress={() => setDetails(true)}
            style={{
              position: "absolute",
              bottom: sheetHeight + 48,
              left: 16,
              right: 16,
              borderRadius: 14,
              backgroundColor: c.surface,
              overflow: "hidden",
            }}
          >
            <Row
              between
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: c.soft,
              }}
            >
              <Txt
                size="caption"
                weight="600"
                color={
                  recording ? (signalLost || noFix ? c.muted : c.good) : c.muted
                }
              >
                {recording
                  ? status
                  : previewLocation
                    ? "Location ready"
                    : "Ready when you are"}
              </Txt>
              <Maximize2 size={18} color={c.text} />
            </Row>
            <Row
              style={{
                paddingHorizontal: 16,
                paddingVertical: 18,
                alignItems: "flex-end",
              }}
            >
              <Metric small value={duration(elapsed)} label="Time" />
              <Stack gap={3} style={{ flex: 1.35, alignItems: "center" }}>
                <Txt
                  size="title"
                  weight="700"
                  mono
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.65}
                >
                  {riding
                    ? speed(currentSpeed, profile?.speedUnit)
                    : currentSpeed > 0
                      ? pace(1000 / currentSpeed)
                      : "—"}
                </Txt>
                <Txt
                  size="caption"
                  color={c.muted}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {riding
                    ? `Speed (${speedLabel(profile?.speedUnit)})`
                    : "Pace /km"}
                </Txt>
              </Stack>
              <Metric
                small
                value={km(stats.distance, 2)}
                label="Distance (km)"
              />
            </Row>
          </Pressable>
        )}
        <View
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: c.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            maxHeight: height * 0.68,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: c.line,
              alignSelf: "center",
              marginBottom: 14,
            }}
          />
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              gap: 16,
              paddingBottom: 4,
            }}
          >
            {!!liveError && (
              <Notice
                text={liveError}
                retry={
                  /location|permission|precise/i.test(liveError)
                    ? () => {
                        void Linking.openSettings();
                      }
                    : undefined
                }
              />
            )}
            {saving ? (
              <>
                <Txt size="heading" weight="700">
                  Save workout
                </Txt>
                <Field
                  label="Activity title"
                  testID="workout-title"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  value={title}
                  placeholder="My workout"
                  onChangeText={setTitle}
                  maxLength={200}
                />
                <Field
                  label="How did it feel?"
                  value={note}
                  placeholder="Optional notes"
                  onChangeText={setNote}
                  multiline
                  maxLength={10000}
                />
                <Field
                  label="Effort · 1 easy to 10 maximum"
                  value={rpe}
                  onChangeText={setRpe}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Button
                  title="Save activity"
                  loading={busy}
                  disabled={recovering}
                  onPress={() => action(save, "Saving your workout…")}
                />
                <Button
                  title="Discard"
                  variant="quiet"
                  disabled={busy || recovering}
                  onPress={discard}
                />
              </>
            ) : (
              <>
                {plannedRoute && (
                  <Row between>
                    <Txt size="caption" weight="600" style={{ flex: 1 }}>
                      {plannedRoute.name}
                    </Txt>
                    <Txt size="caption" color={c.muted}>
                      {km(plannedRoute.distance)} km
                    </Txt>
                  </Row>
                )}
                <Row
                  between
                  style={{ alignItems: "center", paddingVertical: 4 }}
                >
                  {recording ? (
                    <CircleControl
                      label={`Lap ${(recording.lapTimes?.length ?? 0) + 1}`}
                      onPress={() => action(() => engine.markLap())}
                      disabled={
                        busy || recovering || recording.state !== "recording"
                      }
                      icon={<Flag size={25} color={c.text} />}
                    />
                  ) : (
                    <CircleControl
                      label={
                        sports.find((s) => s.value === sport)?.label ??
                        "Activity"
                      }
                      onPress={chooseSport}
                      disabled={busy || recovering}
                      icon={<ActiveSportIcon size={28} color={c.accent} />}
                    />
                  )}
                  <CircleControl
                    primary
                    label={
                      recording
                        ? recording.state === "paused"
                          ? "Resume"
                          : "Pause"
                        : "Start"
                    }
                    accessibilityLabel={
                      recording
                        ? recording.state === "paused"
                          ? "Resume recording"
                          : "Pause recording"
                        : startLabel
                    }
                    testID={!recording ? "start-recording" : undefined}
                    busy={busy}
                    disabled={recovering}
                    onPress={
                      recording
                        ? () =>
                            action(() =>
                              recording.state === "paused"
                                ? resumeRecording(profile!.id)
                                : pauseRecording(),
                            )
                        : begin
                    }
                    icon={
                      recording && recording.state !== "paused" ? (
                        <Pause size={34} color={brand.ink} fill={brand.ink} />
                      ) : (
                        <Play size={34} color={brand.ink} fill={brand.ink} />
                      )
                    }
                  />
                  {recording ? (
                    <CircleControl
                      label="Finish"
                      onPress={finish}
                      disabled={busy || recovering}
                      icon={<Square size={25} color={c.text} />}
                    />
                  ) : (
                    <CircleControl
                      label="Add route"
                      onPress={() => router.push("/routes")}
                      disabled={busy || recovering}
                      icon={<Map size={27} color={c.text} />}
                    />
                  )}
                </Row>
                <Txt
                  size="caption"
                  color={c.muted}
                  style={{ textAlign: "center" }}
                >
                  {recording
                    ? "Your workout is saved on this device as you move."
                    : "GPS records your route with the screen locked."}
                </Txt>
                {ghost && delta !== null && (
                  <Txt
                    size="caption"
                    color={delta <= 0 ? c.good : c.accent}
                    style={{ textAlign: "center" }}
                  >
                    {duration(Math.abs(delta))}{" "}
                    {delta <= 0 ? "ahead of" : "behind"} your average-pace ghost
                  </Txt>
                )}
              </>
            )}
          </ScrollView>
        </View>
        <Modal
          transparent
          visible={options || details}
          animationType="slide"
          onRequestClose={() => {
            setOptions(false);
            setDetails(false);
          }}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Pressable
              accessibilityLabel="Close panel"
              onPress={() => {
                setOptions(false);
                setDetails(false);
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: brand.ink,
                opacity: 0.35,
              }}
            />
            <View
              style={{
                backgroundColor: c.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: height * 0.72,
                padding: 20,
                paddingBottom: Math.max(insets.bottom, 16) + 20,
                gap: 16,
              }}
            >
              <Row between>
                <Txt size="heading" weight="700">
                  {details ? "Workout stats" : "Recording settings"}
                </Txt>
                <Button
                  title="Done"
                  variant="quiet"
                  onPress={() => {
                    setOptions(false);
                    setDetails(false);
                  }}
                />
              </Row>
              <ScrollView contentContainerStyle={{ gap: 18 }}>
                {details ? (
                  <>
                    <Row>
                      <Metric value={duration(elapsed)} label="Elapsed time" />
                      <Metric
                        value={km(stats.distance, 2)}
                        unit="km"
                        label="Distance"
                      />
                    </Row>
                    <Row>
                      <Metric
                        value={speed(currentSpeed, profile?.speedUnit)}
                        unit={speedLabel(profile?.speedUnit)}
                        label="Current speed"
                      />
                      <Metric
                        value={pace(
                          stats.distance
                            ? (stats.moving / stats.distance) * 1000
                            : 0,
                        )}
                        unit="/km"
                        label="Average pace"
                      />
                    </Row>
                    <Row>
                      <Metric
                        small
                        value={duration(stats.moving)}
                        label="Moving time"
                      />
                      <Metric
                        small
                        value={Math.round(stats.ascent).toString()}
                        unit="m"
                        label="Climbed"
                      />
                    </Row>
                    <Txt size="caption" color={c.muted}>
                      {stats.accuracy === null
                        ? "Waiting for GPS"
                        : `GPS accuracy ±${Math.round(stats.accuracy)} m`}{" "}
                      · {stats.count} points saved
                    </Txt>
                  </>
                ) : (
                  <>
                    {!recording && (
                      <Segmented
                        options={sports}
                        value={sport}
                        onChange={setSport}
                      />
                    )}
                    <Button
                      title="Sensors & watch"
                      variant="secondary"
                      onPress={() => {
                        setOptions(false);
                        router.push("/devices");
                      }}
                    />
                    <Txt size="caption" color={c.muted}>
                      Keep RIVL running while recording. Background GPS needs
                      location permission. You can leave this screen and return
                      to the same workout.
                    </Txt>
                    {config.demoEnabled && !recording && (
                      <Row between>
                        <Txt>Simulate a route · test only</Txt>
                        <Switch
                          testID="simulate-route"
                          accessibilityLabel="Simulate a route"
                          value={simulate}
                          onValueChange={setSimulate}
                        />
                      </Row>
                    )}
                    {recording && (
                      <Button
                        title="Discard workout"
                        variant="danger"
                        disabled={busy}
                        onPress={discard}
                      />
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}
function CircleControl({
  label,
  accessibilityLabel,
  onPress,
  icon,
  primary = false,
  disabled = false,
  busy = false,
  testID,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void | Promise<unknown>;
  icon: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const { c, reduceMotion } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const size = primary ? 92 : 60;
  const animate = (v: number) =>
    Animated.spring(scale, {
      toValue: reduceMotion ? 1 : v,
      useNativeDriver: true,
      damping: 20,
      stiffness: 260,
    }).start();
  return (
    <Stack gap={8} style={{ alignItems: "center", minWidth: 76 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: disabled || busy, busy }}
        testID={testID}
        disabled={disabled || busy}
        onPress={() => void onPress()}
        onPressIn={() => animate(0.95)}
        onPressOut={() => animate(1)}
      >
        <Animated.View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: primary ? brand.coral : c.soft,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.4 : 1,
            transform: [{ scale }],
          }}
        >
          {busy ? (
            <ActivityIndicator color={primary ? brand.ink : c.text} />
          ) : (
            icon
          )}
        </Animated.View>
      </Pressable>
      <Txt size="caption" weight="600" color={c.text}>
        {label}
      </Txt>
    </Stack>
  );
}

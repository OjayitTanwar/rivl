import { WorkspaceExit } from "../../src/ui/WorkspaceExit";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, Platform, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useStore } from "../../src/state/store";
import { database } from "../../src/storage/database";
import { TrainingRepository } from "../../src/services/training-repository";
import {
  trainingSports,
  trainingStages,
  trainingDuration,
  trainingPosition,
  formatTrainingDuration,
  type TrainingPlan,
  type TrainingSport,
  type TrainingSession,
  type TrainingHistory,
} from "../../src/domain/guided-training";
import {
  Screen,
  Stack,
  Row,
  Txt,
  Field,
  Choice,
  Button,
  ListRow,
  Notice,
  Metric,
  SectionHeading,
  Empty,
} from "../../src/ui/primitives";
import { SettingsSection } from "../../src/ui/SettingsSection";
import { useTheme } from "../../src/ui/theme";
import { AppFailure, userMessage } from "../../src/security/errors";
import {
  buildTrainingProgression,
  type ProgressionOptions,
} from "../../src/domain/training-progression";
import { CreatorTrainingRepository } from "../../src/services/creator-training-repository";
import {
  speakNavigation,
  stopNavigationVoice,
} from "../../src/services/navigation-voice";
const creatorRepository = new CreatorTrainingRepository(database);
const repository = new TrainingRepository(database);
const sportLabels = { run: "Run", ride: "Ride", walk: "Walk", hike: "Hike" };
const durationKeys = [
  "warmupSec",
  "workSec",
  "recoverySec",
  "cooldownSec",
  "repeats",
] as const;
const labels = {
  warmupSec: "Warm up (seconds)",
  workSec: "Work interval (seconds)",
  recoverySec: "Recovery between repetitions (seconds)",
  cooldownSec: "Cool down (seconds)",
  repeats: "Repetitions",
};
type Snapshot = {
  owner: string;
  plans: TrainingPlan[];
  session: TrainingSession | null;
  history: TrainingHistory[];
};
function IntervalClock({
  session,
  onFinish,
  foreground,
  spoken,
}: {
  session: TrainingSession;
  onFinish: () => void;
  foreground: boolean;
  spoken: boolean;
}) {
  const { c, reduceMotion } = useTheme(),
    [now, setNow] = useState(Date.now()),
    last = useRef<string | null>(null),
    finished = useRef(false);
  const position = trainingPosition(session, foreground ? Date.now() : now);
  useEffect(() => {
    setNow(Date.now());
    if (!foreground || session.state !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [session, foreground]);
  useEffect(() => {
    const key = `${session.id}:${position.index}`;
    if (
      last.current !== null &&
      last.current !== key &&
      foreground &&
      !position.complete &&
      !reduceMotion &&
      Platform.OS !== "web"
    )
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    last.current = key;
    if (position.complete && foreground && !finished.current) {
      finished.current = true;
      onFinish();
    }
  }, [
    session.id,
    position.index,
    position.complete,
    foreground,
    reduceMotion,
    onFinish,
  ]);
  useEffect(() => {
    const owner = `training:${session.id}`;
    if (
      foreground &&
      spoken &&
      session.state === "running" &&
      !position.complete
    )
      speakNavigation(
        `${position.stage?.label}. ${position.remainingSec} seconds.`,
        { owner, repeat: true },
      );
    return () => stopNavigationVoice(owner);
    // Announce only stage/state changes, never every clock tick or missed stage.
  }, [
    session.id,
    session.state,
    position.index,
    position.complete,
    foreground,
    spoken,
  ]);
  return (
    <Stack gap={12}>
      <View
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={
          position.complete
            ? "Interval session complete"
            : `${position.stage?.label}. ${session.state === "paused" ? "Paused" : "Running"}`
        }
      >
        <Txt size="heading" weight="700">
          {position.stage?.label ?? "Session finished"}
        </Txt>
      </View>
      <Txt
        size="display"
        weight="700"
        mono
        accessibilityLabel={`${position.remainingSec} seconds remaining`}
      >
        {formatTrainingDuration(position.remainingSec)}
      </Txt>
      <Row between>
        <Txt color={c.muted}>
          {session.state === "paused" ? "Paused" : "Interval timer"}
        </Txt>
        <Txt mono color={c.muted}>
          {formatTrainingDuration(position.elapsedMs / 1000)} /{" "}
          {formatTrainingDuration(position.totalMs / 1000)}
        </Txt>
      </Row>
      {position.clockRollback && (
        <Notice text="The device clock moved backwards. Pause this timer or correct the clock before continuing." />
      )}
      {!!session.skipped && (
        <Txt size="caption" color={c.muted}>
          {session.skipped} interval{session.skipped === 1 ? "" : "s"} skipped
        </Txt>
      )}
    </Stack>
  );
}
export default function GuidedTraining({
  view = "plans",
}: {
  view?: "plans" | "session" | "history";
}) {
  const { profile } = useStore(),
    { c } = useTheme(),
    owner = profile?.id,
    ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [pending, setPending] = useState("");
  const [editor, setEditor] = useState<{
      id: string;
      original: TrainingPlan | null;
    } | null>(null),
    [name, setName] = useState(""),
    [sport, setSport] = useState<TrainingSport>("run"),
    [values, setValues] = useState<Record<string, string>>({
      warmupSec: "",
      workSec: "",
      recoverySec: "",
      cooldownSec: "",
      repeats: "",
    });
  const [focused, setFocused] = useState(false),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  const [spoken, setSpoken] = useState(false);
  const [progression, setProgression] = useState<TrainingPlan | null>(null);
  const [progressionOptions, setProgressionOptions] =
    useState<ProgressionOptions>({
      weeks: 4,
      sessionsPerWeek: 3,
      weeklyPercent: 5,
      feedback: "repeat",
    });
  useEffect(() => {
    setSpoken(false);
    setProgression(null);
  }, [owner]);
  const lock = useRef(false);
  const read = async (id: string) => {
    const [plans, session, history] = await Promise.all([
      repository.plans(id),
      repository.active(id),
      repository.history(id),
    ]);
    return { owner: id, plans, session, history };
  };
  const draftOwner = useRef(owner);
  const restoredOwner = useRef<string | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setFocused(true);
      if (restoredOwner.current !== owner) {
        setLoaded(false);
        setLoading(true);
      }
      if (draftOwner.current !== owner) {
        setEditor(null);
        draftOwner.current = owner;
      }
      setError("");
      if (!owner) {
        restoredOwner.current = undefined;
        setData(null);
        setLoading(false);
        return;
      }
      void read(owner)
        .then((snapshot) => {
          if (active) {
            restoredOwner.current = owner;
            setData(snapshot);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(userMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
        setFocused(false);
      };
    }, [owner, revision]),
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  const snapshot = data?.owner === owner ? data : null,
    ready = loaded && !!snapshot && !loading,
    session = snapshot?.session;
  const perform = async (
    label: string,
    work: (id: string) => Promise<unknown>,
  ) => {
    if (!owner || !ready || lock.current) return;
    const id = owner;
    lock.current = true;
    setPending(label);
    setError("");
    try {
      await work(id);
      const next = await read(id);
      if (ownerRef.current === id) {
        setData(next);
        setEditor(null);
      }
    } catch (e) {
      if (ownerRef.current === id) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id) setPending("");
    }
  };
  const transition = (
    action: "pause" | "resume" | "skip" | "end" | "complete",
  ) => {
    if (session)
      void perform("Updating timer", (id) =>
        repository.transition(id, session.id, action),
      );
  };
  const finishRef = useRef(() => {});
  finishRef.current = () => transition("complete");
  const complete = useCallback(() => finishRef.current(), []);
  const open = (plan?: TrainingPlan) => {
    if (!ready || lock.current) return;
    setEditor({ id: plan?.id ?? randomUUID(), original: plan ?? null });
    setName(plan?.title ?? "");
    setSport(plan?.sport ?? "run");
    setValues(
      Object.fromEntries(
        durationKeys.map((key) => [
          key,
          plan ? String(plan[key]) : key === "repeats" ? "1" : "",
        ]),
      ),
    );
    setError("");
  };
  const save = () =>
    void perform("Saving plan", async (id) => {
      if (!editor)
        throw new AppFailure("validation", "Choose a training plan.");
      const numbers = Object.fromEntries(
        durationKeys.map((key) => {
          const text = values[key]?.trim() ?? "";
          if (!/^\d+$/.test(text))
            throw new AppFailure(
              "validation",
              "Use whole seconds and repetitions. Enter 0 to leave warm up, recovery or cool down out.",
            );
          return [key, Number(text)];
        }),
      ) as Pick<TrainingPlan, (typeof durationKeys)[number]>;
      await repository.save(
        {
          ...numbers,
          id: editor.id,
          ownerId: id,
          title: name.trim(),
          sport,
          updatedAt: Date.now(),
        },
        editor.original,
      );
    });
  const confirm = (title: string, body: string, action: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(body)) action();
    } else
      Alert.alert(title, body, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: "destructive", onPress: action },
      ]);
  };
  const plans = useMemo(
    () => snapshot?.plans.slice(0, 100) ?? [],
    [snapshot?.plans],
  );
  return (
    <Screen
      title={
        view === "session"
          ? "Training session"
          : view === "history"
            ? "Training history"
            : "Training plans"
      }
      action={<WorkspaceExit />}
      contentStyle={{ paddingBottom: 120 }}
    >
      <Stack gap={20}>
        {loading && !!owner && <Txt size="caption" color={c.muted}>Loading training…</Txt>}
        {!owner ? (
          <Notice text="Sign in to keep training plans and interval sessions." />
        ) : (
          <>
            {view === "plans" && (
              <ListRow
                title="Explore training programs"
                detail="Creator schedules, shared programs and your drafts"
                onPress={() => router.push("/training-creators")}
              />
            )}
            {ready && view !== "session" && (
              <Stack gap={16} style={{ paddingBottom: 4 }}>
                <Row style={{ gap: 16, flexWrap: "wrap" }}>
                  <Metric small value={String(plans.length)} label="Saved plans" />
                  <Metric small value={String(snapshot.history.filter((item) => item.completed).length)} label="Sessions finished" />
                  <Metric small value={formatTrainingDuration(snapshot.history.reduce((total, item) => total + item.elapsedMs, 0) / 1000)} label="Timer time" />
                </Row>

              </Stack>
            )}
            {!!error && (
              <Notice
                text={error}
                retry={!pending ? () => setRevision((n) => n + 1) : undefined}
              />
            )}
            {!loaded && !loading && !!error && (
              <Button
                title="Clear saved interval timer"
                variant="quiet"
                onPress={() =>
                  confirm(
                    "Clear saved timer?",
                    "This removes only the saved guidance timer. It will not erase or stop a GPS recording.",
                    () => {
                      if (!owner || lock.current) return;
                      const id = owner;
                      lock.current = true;
                      setPending("Clearing timer");
                      void repository
                        .clearTimer(id)
                        .then(() => {
                          if (ownerRef.current === id)
                            setRevision((n) => n + 1);
                        })
                        .catch((e) => {
                          if (ownerRef.current === id) setError(userMessage(e));
                        })
                        .finally(() => {
                          lock.current = false;
                          if (ownerRef.current === id) setPending("");
                        });
                    },
                  )
                }
                disabled={!!pending}
              />
            )}
            {!!pending && (
              <View accessibilityLiveRegion="polite">
                <Txt color={c.muted}>{pending}…</Txt>
              </View>
            )}
            {ready && view === "plans" && session && (
              <ListRow
                title="Continue active session"
                detail={session.plan.title}
                onPress={() => router.push("/training-session")}
              />
            )}
            {ready && view === "session" && !session && (
              <Stack gap={16}>
                <Txt color={c.muted}>No session running.</Txt>
                <Button title="Choose a training plan" onPress={() => router.push("/training")} />
              </Stack>
            )}
            {ready && view === "session" && session && (
              <SettingsSection title="Active session">
                <Txt weight="600">
                  {session.plan.title} · {sportLabels[session.plan.sport]}
                </Txt>
                <IntervalClock
                  key={session.id}
                  session={session}
                  foreground={foreground && focused}
                  spoken={spoken}
                  onFinish={complete}
                />
                <Txt size="caption" color={c.muted}>
                  Keep this page open for cues. Record GPS separately.
                </Txt>
                <Button
                  title={
                    spoken ? "Spoken guidance: on" : "Enable spoken guidance"
                  }
                  variant="quiet"
                  onPress={() => setSpoken((value) => !value)}
                />
                <Button
                  title={
                    session.state === "running"
                      ? "Pause guidance"
                      : "Resume guidance"
                  }
                  disabled={!!pending}
                  onPress={() =>
                    transition(session.state === "running" ? "pause" : "resume")
                  }
                />
                <Button
                  title="Skip interval"
                  variant="secondary"
                  disabled={!!pending}
                  onPress={() => transition("skip")}
                />
                <Button
                  title="End guidance"
                  variant="quiet"
                  disabled={!!pending}
                  onPress={() =>
                    confirm(
                      "End guidance?",
                      "Save this interval session as ended early? Your GPS recording stays as it is.",
                      () => transition("end"),
                    )
                  }
                />
              </SettingsSection>
            )}
            {ready && view === "plans" && progression && (
              <SettingsSection title="Build a progressive program">
                <Txt>{progression.title}</Txt>
                <Choice
                  label="Weeks"
                  value={String(progressionOptions.weeks)}
                  options={[2, 4, 8, 12].map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                  onChange={(weeks) =>
                    setProgressionOptions((value) => ({
                      ...value,
                      weeks: Number(weeks),
                    }))
                  }
                />
                <Choice
                  label="Sessions per week"
                  value={String(progressionOptions.sessionsPerWeek)}
                  options={[1, 2, 3, 4].map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                  onChange={(sessionsPerWeek) =>
                    setProgressionOptions((value) => ({
                      ...value,
                      sessionsPerWeek: Number(sessionsPerWeek),
                    }))
                  }
                />
                <Choice
                  label="How did your base session feel?"
                  value={progressionOptions.feedback}
                  options={[
                    {
                      value: "comfortable" as const,
                      label: "Comfortable · progress",
                    },
                    { value: "repeat" as const, label: "Keep it steady" },
                    {
                      value: "reduce" as const,
                      label: "Too much · reduce 10%",
                    },
                  ]}
                  onChange={(feedback) =>
                    setProgressionOptions((value) => ({ ...value, feedback }))
                  }
                />
                <Choice
                  label="Work duration increase per build week"
                  value={String(progressionOptions.weeklyPercent)}
                  options={[0, 5, 10].map((value) => ({
                    value: String(value),
                    label: `${value}%`,
                  }))}
                  onChange={(weeklyPercent) =>
                    setProgressionOptions((value) => ({
                      ...value,
                      weeklyPercent: Number(weeklyPercent),
                    }))
                  }
                />
                <Txt size="caption" color={c.muted}>
                  Comfortable builds work time; every fourth week eases by 20%.
                </Txt>
                {(() => {
                  try {
                    const preview = buildTrainingProgression(
                      progression,
                      progressionOptions,
                      { id: "preview", creatorName: "You", now: Date.now() },
                    );
                    return (
                      <Txt>
                        {preview.sessions.length} sessions · first{" "}
                        {preview.sessions[0]?.workout.workSec}s work · last{" "}
                        {preview.sessions.at(-1)?.workout.workSec}s work per
                        repetition
                      </Txt>
                    );
                  } catch (e) {
                    return <Notice text={userMessage(e)} />;
                  }
                })()}
                <Button
                  title="Save program draft"
                  disabled={!!pending}
                  onPress={() =>
                    void perform("Saving program", async (id) => {
                      const program = buildTrainingProgression(
                        { ...progression, ownerId: id },
                        progressionOptions,
                        {
                          id: randomUUID(),
                          creatorName: "You",
                          now: Date.now(),
                        },
                      );
                      await creatorRepository.save(program, null);
                      if (ownerRef.current === id) {
                        setProgression(null);
                        router.push("/training-creators");
                      }
                    })
                  }
                />
                <Button
                  title="Cancel program"
                  variant="quiet"
                  disabled={!!pending}
                  onPress={() => setProgression(null)}
                />
              </SettingsSection>
            )}
            {ready &&
              view === "plans" &&
              (editor ? (
                <SettingsSection
                  title={editor.original ? "Edit plan" : "New plan"}
                >
                  <Field
                    label="Session name"
                    value={name}
                    onChangeText={setName}
                    maxLength={100}
                    editable={!pending}
                  />
                  <Choice
                    label="Sport"
                    value={sport}
                    options={trainingSports.map((value) => ({
                      value,
                      label: sportLabels[value],
                    }))}
                    onChange={(v) => {
                      if (!pending) setSport(v);
                    }}
                  />
                  {durationKeys.map((key) => (
                    <Field
                      key={key}
                      label={labels[key]}
                      value={values[key]}
                      onChangeText={(value) =>
                        setValues((previous) => ({ ...previous, [key]: value }))
                      }
                      keyboardType="number-pad"
                      editable={!pending}
                      maxLength={5}
                    />
                  ))}
                  <Txt size="caption" color={c.muted}>
                    Enter 0 to skip warm up, recovery or cool down.
                  </Txt>
                  <Button
                    title="Save plan"
                    onPress={save}
                    disabled={!!pending}
                    loading={pending === "Saving plan"}
                  />
                  <Button
                    title="Cancel"
                    variant="quiet"
                    disabled={!!pending}
                    onPress={() => {
                      setEditor(null);
                      setError("");
                    }}
                  />
                  {!!editor.original && (
                    <Button
                      title="Delete plan"
                      variant="danger"
                      disabled={!!pending}
                      onPress={() => {
                        const plan = editor.original!;
                        confirm(
                          "Delete plan?",
                          "Remove this training plan? An active timer keeps its own copy.",
                          () =>
                            void perform("Deleting plan", () =>
                              repository.remove(plan),
                            ),
                        );
                      }}
                    />
                  )}
                </SettingsSection>
              ) : (
                <SettingsSection title="Your plans">
                  {!plans.length && (
                    <Txt color={c.muted}>No saved plans yet.</Txt>
                  )}
                  <Button
                    title="Create plan"
                    onPress={() => open()}
                    disabled={!!pending}
                  />
                  {plans.map((plan) => (
                    <View
                      key={plan.id}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: c.line,
                        paddingTop: 8,
                      }}
                    >
                      <ListRow
                        title={plan.title}
                        detail={`${sportLabels[plan.sport]} · ${formatTrainingDuration(trainingDuration(trainingStages(plan)))} · ${plan.repeats} repetition${plan.repeats === 1 ? "" : "s"}`}
                        onPress={() => open(plan)}
                      />
                      <Button
                        title={`Build program from ${plan.title}`}
                        variant="quiet"
                        disabled={!!pending}
                        onPress={() => {
                          setProgression(plan);
                          setError("");
                        }}
                      />
                      <Button
                        title={`Start ${plan.title}`}
                        variant="secondary"
                        disabled={!!pending || !!session}
                        onPress={() =>
                          void perform("Starting guidance", (id) =>
                            repository
                              .start(id, plan, randomUUID())
                              .then(() => {
                                if (ownerRef.current === id)
                                  router.push("/training-session");
                              }),
                          )
                        }
                      />
                    </View>
                  ))}
                </SettingsSection>
              ))}
            {ready && view === "history" && (
              <SettingsSection title="Recent interval sessions">
                {!snapshot.history.length && (
                  <Stack gap={12}>
                    <Txt color={c.muted}>Your completed sessions will appear here.</Txt>
                    <Button title="Find a training plan" variant="secondary" onPress={() => router.push("/training")} />
                  </Stack>
                )}
                {snapshot.history.slice(0, 20).map((item) => (
                  <ListRow
                    key={item.session.id}
                    title={item.session.plan.title}
                    detail={`${new Date(item.endedAt).toLocaleString()} · ${formatTrainingDuration(item.elapsedMs / 1000)} ${item.session.skipped ? "timer progress" : "on the timer"} · ${item.completed ? "Timer finished" : "Ended early"}${item.session.skipped ? ` · ${item.session.skipped} skipped` : ""}`}
                  />
                ))}
              </SettingsSection>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
}

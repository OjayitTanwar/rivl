import { WorkspaceExit } from "../../src/ui/WorkspaceExit";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Platform, Share, View, AppState } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useStore } from "../../src/state/store";
import { database } from "../../src/storage/database";
import { WellnessRepository } from "../../src/services/wellness-repository";
import { health, type HealthSnapshot } from "../../src/services/health";
import { refreshAutomaticWellness } from "../../src/services/automatic-wellness";
import { observedHeartRateLog } from "../../src/domain/observed-heart-rate";
import {
  wellnessMetrics,
  wellnessUnit,
  wellnessValue,
  validateWellnessEntry,
  parseWellnessLocalTime,
  formatWellnessLocalTime,
  type WellnessEntry,
  type WellnessKind,
} from "../../src/domain/wellness";
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
} from "../../src/ui/primitives";
import { SettingsSection } from "../../src/ui/SettingsSection";
import { useTheme } from "../../src/ui/theme";
import { useFullScreenLoading } from "../../src/ui/loading-state";
import { userMessage } from "../../src/security/errors";

const repository = new WellnessRepository(database);
const manualKinds = ["water", "weight", "sleep", "steps"] as const;
const kinds = [...manualKinds, "floorsClimbed", "activeEnergy"] as const;
const options = manualKinds.map((value) => ({
  value,
  label: wellnessMetrics[value].label,
}));
type Snapshot = {
  owner: string;
  entries: WellnessEntry[];
  fast: number | null;
};
const displayValue = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });
function FastingClock({ start }: { start: number }) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [start]);
  return (
    <Txt size="heading" weight="700" mono>
      {clock < start
        ? "Check device clock"
        : `${Math.floor((clock - start) / 3600000)}h ${Math.floor((clock - start) / 60000) % 60}m`}
    </Txt>
  );
}

export default function HealthLog({
  view = "overview",
}: {
  view?: "overview" | "history" | "connection";
}) {
  const { profile, activities } = useStore(),
    { c } = useTheme();
  const owner = profile?.id;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [connected, setConnected] = useState(false);
  const observations = useMemo(
    () => observedHeartRateLog(activities, owner ?? ""),
    [activities, owner],
  );
  const highest = observations.reduce<number | null>(
    (peak, item) => Math.max(peak ?? 0, item.bpm),
    null,
  );
  const lock = useRef(false);
  const [editing, setEditing] = useState<{
    entry: WellnessEntry;
    original: WellnessEntry | null;
  } | null>(null);
  const [value, setValue] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  useFullScreenLoading(loading && !!owner, "Loading your health log");
  const draftOwner = useRef(owner);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setReady(false);
      setError("");
      if (draftOwner.current !== owner) {
        setEditing(null);
        draftOwner.current = owner;
      }
      setHistoryPage(0);
      setConnected(false);
      if (!owner) {
        setData(null);
        setLoading(false);
        return;
      }
      Promise.all([
        repository.list(owner),
        repository.activeFast(owner),
        database.get<HealthSnapshot>("health:" + owner),
      ])
        .then(([entries, fast, connection]) => {
          if (active) {
            setData({ owner, entries, fast });
            setReady(true);
            setConnected(!!connection);
            if (connection)
              void refreshHealth(
                false,
                owner,
                () => active && ownerRef.current === owner,
              );
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
      };
    }, [owner, revision]),
  );
  const snapshot = data && data.owner === owner ? data : null;
  const entries = snapshot?.entries ?? [];
  const fast = snapshot?.fast ?? null;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && connected && owner && !editing)
        void refreshHealth(false, owner);
    });
    return () => subscription.remove();
  }, [connected, owner, editing]);
  async function refreshHealth(
    requestPermission: boolean,
    id = owner,
    isActive: () => boolean = () => ownerRef.current === id,
  ) {
    if (!id || lock.current || !isActive()) return;
    lock.current = true;
    setPending(
      requestPermission ? "Connecting health data" : "Refreshing health data",
    );
    const timeoutMs = requestPermission ? 120000 : 15000;
    const deadline = Date.now() + timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canCommit = () =>
      isActive() && ownerRef.current === id && Date.now() < deadline;
    try {
      const result = await Promise.race([
        requestPermission ? health.connect() : health.refresh(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Health refresh timed out")),
            timeoutMs,
          );
        }),
      ]);
      if (!canCommit()) return;
      if (requestPermission) await database.set("health:" + id, result);
      await refreshAutomaticWellness(database, id, result, canCommit);
      if (!canCommit()) return;
      const records = await repository.list(id);
      if (canCommit()) {
        setConnected(true);
        setData((current) =>
          current?.owner === id ? { ...current, entries: records } : current,
        );
        setError("");
      }
    } catch (e) {
      if (isActive() && ownerRef.current === id) setError(userMessage(e));
    } finally {
      if (timer) clearTimeout(timer);
      lock.current = false;
      if (ownerRef.current === id) setPending("");
    }
  }
  const open = (entry?: WellnessEntry) => {
    if (!owner || !ready || lock.current) return;
    const next = entry ?? {
      id: randomUUID(),
      ownerId: owner,
      kind: "water" as WellnessKind,
      value: 0,
      at: Date.now(),
      note: "",
    };
    setEditing({ entry: next, original: entry ?? null });
    setValue(entry ? String(entry.value) : "");
    setTime(formatWellnessLocalTime(next.at));
    setNote(next.note);
    setError("");
  };
  const perform = async (
    label: string,
    action: (id: string) => Promise<unknown>,
  ) => {
    if (!owner || !ready || lock.current) return;
    const id = owner;
    lock.current = true;
    setPending(label);
    setError("");
    try {
      await action(id);
      const [records, timer] = await Promise.all([
        repository.list(id),
        repository.activeFast(id),
      ]);
      if (ownerRef.current === id) {
        setData({ owner: id, entries: records, fast: timer });
        setEditing(null);
      }
    } catch (e) {
      if (ownerRef.current === id) setError(userMessage(e));
    } finally {
      lock.current = false;
      setPending("");
    }
  };
  const save = () =>
    perform("Saving record", async (id) => {
      if (!editing || editing.entry.ownerId !== id)
        throw new Error("Reload this account's history before saving.");
      const at =
        time === formatWellnessLocalTime(editing.entry.at)
          ? editing.entry.at
          : parseWellnessLocalTime(time);
      const amount =
        value.trim() && /^\d+(?:[.,]\d+)?$/.test(value.trim())
          ? Number(value.trim().replace(",", "."))
          : NaN;
      const record = validateWellnessEntry({
        ...editing.entry,
        at,
        value: amount,
        note: note.trim(),
        startedAt:
          editing.entry.kind === "fasting" ? at - amount * 3600000 : undefined,
      });
      await repository.save(record, editing.original);
    });
  const remove = () => {
    if (!editing?.original || lock.current) return;
    const record = editing.original;
    const action = () => {
      void perform("Deleting record", (id) =>
        repository.remove(id, record.id, record),
      );
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this health record?")) action();
    } else
      Alert.alert(
        "Delete record?",
        "This removes the saved entry from your health log.",
        [
          { text: "Keep record", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: action },
        ],
      );
  };
  return (
    <Screen
      title={
        view === "history"
          ? "Health log"
          : view === "connection"
            ? "Health connections"
            : "Health"
      }
      action={<WorkspaceExit />}
      contentStyle={{ paddingBottom: 120 }}
    >
      {!owner ? (
        <Notice text="Sign in to keep your health log." />
      ) : (
        <Stack gap={20}>
          {view === "connection" && (
            <>
              <Txt color={c.muted}>
                Connect once to keep daily movement and sleep up to date. Water
                imports from apps that record your drinks.
              </Txt>
              <Button
                title={
                  connected ? "Refresh health data" : "Connect health data"
                }
                variant="secondary"
                disabled={!ready || !!pending}
                onPress={() => void refreshHealth(!connected)}
              />
              {connected ? (
                <Button
                  title="Manage health access"
                  variant="quiet"
                  disabled={!ready || !!pending}
                  onPress={() => void refreshHealth(true)}
                />
              ) : null}
              <Txt size="caption" color={c.muted}>
                Floors are platform-recorded flights or floors, not estimated
                from steps. Active energy excludes resting energy; it is not a
                food allowance.
              </Txt>
              <Txt size="caption" color={c.muted}>
                Synced water takes priority over manual intake for that day.
                Edit synced records in their original app.
              </Txt>
            </>
          )}
          {view === "overview" && (
            <ListRow
              title="Recorded heart-rate peak"
              detail={
                highest === null
                  ? "No sustained sensor readings yet"
                  : `${highest} bpm · Logged automatically from saved workouts`
              }
              onPress={() => router.push("/settings")}
            />
          )}
          {view === "overview" && !connected && (
            <ListRow
              title="Connect health data"
              detail="Import movement, sleep and supported readings"
              onPress={() => router.push("/health-settings")}
            />
          )}
          {!!error && (
            <Notice
              text={error}
              retry={
                pending || editing ? undefined : () => setRevision((n) => n + 1)
              }
            />
          )}
          {loading && <Txt color={c.muted}>Loading health records…</Txt>}
          {!!pending && (
            <View accessibilityLiveRegion="polite" accessible>
              <Txt color={c.muted}>{pending}…</Txt>
            </View>
          )}
          {ready &&
            view !== "connection" &&
            (editing?.entry.ownerId === owner ? (
              <SettingsSection
                title={editing.original ? "Edit record" : "Add record"}
              >
                {editing.entry.kind === "fasting" ? (
                  <Txt weight="600">Fasting duration</Txt>
                ) : (
                  <Choice
                    label="Record"
                    value={editing.entry.kind}
                    options={options}
                    onChange={(kind) => {
                      if (!pending) {
                        setEditing({
                          ...editing,
                          entry: { ...editing.entry, kind },
                        });
                        setValue("");
                      }
                    }}
                  />
                )}
                <Field
                  label={`${wellnessMetrics[editing.entry.kind].label} (${wellnessMetrics[editing.entry.kind].unit})`}
                  value={value}
                  onChangeText={setValue}
                  keyboardType={
                    wellnessMetrics[editing.entry.kind].whole
                      ? "number-pad"
                      : "decimal-pad"
                  }
                  editable={!pending}
                />
                <Field
                  label={
                    editing.entry.kind === "fasting"
                      ? "Finished at (YYYY-MM-DD HH:mm)"
                      : "Recorded at (YYYY-MM-DD HH:mm)"
                  }
                  value={time}
                  onChangeText={setTime}
                  autoCapitalize="none"
                  editable={!pending}
                  maxLength={16}
                />
                <Txt size="caption" color={c.muted}>
                  Times use your device timezone:{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}.{" "}
                  {editing.entry.kind === "fasting"
                    ? "The start is calculated from your duration and finish time."
                    : editing.entry.kind === "steps"
                      ? "Enter the day's total, not an additional step count."
                      : editing.entry.kind === "sleep"
                        ? "Enter your sleep duration. This is a user-entered value."
                        : ""}
                </Txt>
                <Field
                  label="Note (optional)"
                  value={note}
                  onChangeText={setNote}
                  maxLength={500}
                  multiline
                  editable={!pending}
                />
                <Button
                  title="Save record"
                  onPress={save}
                  disabled={!!pending}
                  loading={pending === "Saving record"}
                />
                <Button
                  title="Cancel"
                  variant="quiet"
                  onPress={() => {
                    setEditing(null);
                    setError("");
                  }}
                  disabled={!!pending}
                />
                {!!editing.original && (
                  <Button
                    title="Delete record"
                    variant="danger"
                    onPress={remove}
                    disabled={!!pending}
                  />
                )}
              </SettingsSection>
            ) : (
              <>
                {view === "overview" && (
                  <SettingsSection title="Your latest entries">
                    {kinds.map((kind) => {
                      const amount = wellnessValue(entries, kind);
                      const latest =
                        (kind === "water"
                          ? entries.find(
                              (e) =>
                                e.kind === kind &&
                                e.source &&
                                e.at <= Date.now() &&
                                formatWellnessLocalTime(e.at).slice(0, 10) ===
                                  formatWellnessLocalTime(Date.now()).slice(
                                    0,
                                    10,
                                  ),
                            )
                          : undefined) ??
                        entries.find(
                          (e) => e.kind === kind && e.at <= Date.now(),
                        );
                      return (
                        <ListRow
                          key={kind}
                          onPress={
                            kind === "sleep"
                              ? () => router.push("/sleep")
                              : undefined
                          }
                          title={
                            kind === "water"
                              ? "Water today"
                              : kind === "steps"
                                ? "Steps today"
                                : kind === "floorsClimbed"
                                  ? latest?.source?.provider === "HealthKit"
                                    ? "Flights climbed today"
                                    : "Floors climbed today"
                                  : kind === "activeEnergy"
                                    ? "Active energy today"
                                    : wellnessMetrics[kind].label
                          }
                          detail={
                            amount === null ||
                            (kind === "water" &&
                              !entries.some(
                                (e) =>
                                  e.kind === kind &&
                                  e.at <= Date.now() &&
                                  formatWellnessLocalTime(e.at).slice(0, 10) ===
                                    formatWellnessLocalTime(Date.now()).slice(
                                      0,
                                      10,
                                    ),
                              ))
                              ? kind === "floorsClimbed" ||
                                kind === "activeEnergy"
                                ? "No connected reading"
                                : "No entry yet"
                              : `${displayValue(amount)} ${wellnessUnit({ kind, source: latest?.source })}${latest?.source ? ` · ${latest.source.provider}${kind === "sleep" ? " · Last 24 hours" : ""}` : " · User-entered"}${(kind === "floorsClimbed" || kind === "activeEnergy") && latest ? ` · Read ${new Date(latest.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}${(kind === "sleep" || kind === "weight") && latest ? ` · ${new Date(latest.at).toLocaleDateString()}` : ""}`
                          }
                        />
                      );
                    })}
                    <ListRow
                      title="Your health log"
                      detail="Add records, review history and fasting"
                      onPress={() => router.push("/health-history")}
                    />
                  </SettingsSection>
                )}
                {view === "history" && (
                  <>
                    <Button
                      title="Add record"
                      onPress={() => open()}
                      disabled={!!pending}
                    />
                    <SettingsSection title="Fasting timer">
                      {fast === null ? (
                        <>
                          <Txt color={c.muted}>
                            Track elapsed time with a start and finish. No
                            schedule is prescribed.
                          </Txt>
                          <Button
                            title="Start timer"
                            variant="secondary"
                            disabled={!!pending}
                            onPress={() =>
                              perform("Starting timer", (id) =>
                                repository.startFast(id),
                              )
                            }
                          />
                        </>
                      ) : (
                        <>
                          <FastingClock start={fast} />
                          <Txt color={c.muted}>
                            Started {new Date(fast).toLocaleString()}
                          </Txt>
                          <Button
                            title="Finish and save"
                            disabled={!!pending}
                            onPress={() =>
                              perform("Finishing timer", (id) =>
                                repository.finishFast(id, randomUUID()),
                              )
                            }
                          />
                          <Button
                            title="Cancel timer"
                            variant="quiet"
                            disabled={!!pending}
                            onPress={() =>
                              perform("Cancelling timer", (id) =>
                                repository.cancelFast(id),
                              )
                            }
                          />
                        </>
                      )}
                    </SettingsSection>
                    <SettingsSection title="History">
                      {!entries.length && (
                        <Txt color={c.muted}>
                          Your saved records will appear here. Tap any entry to
                          edit its value, time or note.
                        </Txt>
                      )}
                      {entries
                        .slice(historyPage * 50, (historyPage + 1) * 50)
                        .map((entry) => (
                          <View
                            key={entry.id}
                            style={{
                              borderBottomWidth: 1,
                              borderBottomColor: c.line,
                            }}
                          >
                            <ListRow
                              title={`${wellnessMetrics[entry.kind].label} · ${displayValue(entry.value)} ${wellnessUnit(entry)}`}
                              detail={`${new Date(entry.at).toLocaleString()} · ${entry.source?.provider ?? "User-entered"}${entry.source && entry.kind === "sleep" ? " · Last 24 hours" : ""}${entry.note ? `\n${entry.note}` : ""}`}
                              onPress={
                                entry.source ? undefined : () => open(entry)
                              }
                            />
                          </View>
                        ))}
                      {entries.length > 50 && (
                        <Row between>
                          <Button
                            title="Previous"
                            variant="quiet"
                            disabled={historyPage === 0}
                            onPress={() => setHistoryPage((page) => page - 1)}
                          />
                          <Txt size="caption">
                            {historyPage + 1} / {Math.ceil(entries.length / 50)}
                          </Txt>
                          <Button
                            title="Next"
                            variant="quiet"
                            disabled={(historyPage + 1) * 50 >= entries.length}
                            onPress={() => setHistoryPage((page) => page + 1)}
                          />
                        </Row>
                      )}
                      {!!entries.length && (
                        <Button
                          title="Export health log"
                          variant="quiet"
                          disabled={!!pending}
                          onPress={() =>
                            perform("Exporting health log", async (id) => {
                              const [records, timer] = await Promise.all([
                                repository.list(id),
                                repository.activeFast(id),
                              ]);
                              await Share.share({
                                title: "RIVL health log",
                                message: JSON.stringify(
                                  {
                                    version: 1,
                                    exportedAt: new Date().toISOString(),
                                    timezone:
                                      Intl.DateTimeFormat().resolvedOptions()
                                        .timeZone,
                                    entries: records.map((entry) => ({
                                      ...entry,
                                      unit: wellnessUnit(entry),
                                      timestamp: new Date(
                                        entry.at,
                                      ).toISOString(),
                                      source: entry.source ?? "user-entered",
                                    })),
                                    activeFastStartedAt:
                                      timer === null
                                        ? null
                                        : new Date(timer).toISOString(),
                                  },
                                  null,
                                  2,
                                ),
                              });
                            })
                          }
                        />
                      )}
                    </SettingsSection>
                  </>
                )}
              </>
            ))}
        </Stack>
      )}
    </Screen>
  );
}

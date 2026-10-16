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
import { Heart, Footprints, Moon, Droplets, Watch } from "lucide-react-native";
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
  Metric,
  SectionHeading,
  Empty,
  Pill,
} from "../../src/ui/primitives";
import { SettingsSection } from "../../src/ui/SettingsSection";
import { useTheme } from "../../src/ui/theme";
import { userMessage } from "../../src/security/errors";

import { healthTrend, healthRecordValue } from "../../src/domain/health-trends";

const repository = new WellnessRepository(database);
const manualKinds = [
  "water",
  "weight",
  "sleep",
  "steps",
  "bloodPressure",
  "cycle",
  "medication",
] as const;
const kinds = [
  "water",
  "weight",
  "sleep",
  "steps",
  "floorsClimbed",
  "activeEnergy",
] as const;
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
  const [diastolic, setDiastolic] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [doseUnit, setDoseUnit] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const restoredOwner = useRef<string | undefined>(undefined);

  const draftOwner = useRef(owner);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const restoring = restoredOwner.current !== owner;
      setLoading(restoring);
      setReady(!restoring);
      setError("");
      if (draftOwner.current !== owner) {
        setEditing(null);
        draftOwner.current = owner;
      }
      if (restoring) {
        setHistoryPage(0);
        setConnected(false);
      }
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
            restoredOwner.current = owner;
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
  const trend = healthTrend(entries);
  const availableKinds = kinds.filter(
    (kind) =>
      wellnessValue(entries, kind) !== null &&
      (kind !== "water" ||
        entries.some(
          (entry) =>
            entry.kind === "water" &&
            entry.at <= Date.now() &&
            formatWellnessLocalTime(entry.at).slice(0, 10) ===
              formatWellnessLocalTime(Date.now()).slice(0, 10),
        )),
  );
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
    setDiastolic(entry?.diastolic ? String(entry.diastolic) : "");
    setMedicationName(entry?.medicationName ?? "");
    setDoseUnit(entry?.doseUnit ?? "");
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
        diastolic:
          editing.entry.kind === "bloodPressure"
            ? Number(diastolic)
            : undefined,
        medicationName:
          editing.entry.kind === "medication"
            ? medicationName.trim()
            : undefined,
        doseUnit:
          editing.entry.kind === "medication" ? doseUnit.trim() : undefined,
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
      contentStyle={{ gap: 24, paddingBottom: 120 }}
    >
      {!owner ? (
        <Notice text="Sign in to keep your health log." />
      ) : (
        <Stack gap={24}>
          {view === "connection" && (
            <>
              <Stack
                gap={16}
                style={{
                  paddingBottom: 24,
                  borderBottomWidth: 1,
                  borderBottomColor: c.line,
                }}
              >
                <Row between style={{ flexWrap: "wrap", gap: 12 }}>
                  <Watch size={28} color={c.accent} />
                  <Pill>
                    {connected ? "Health connection enabled" : "Not connected"}
                  </Pill>
                </Row>
                <Txt size="heading" weight="700">
                  Your health, in one place
                </Txt>
                <Txt color={c.muted}>
                  Sync readings from your health apps and watch.
                </Txt>
                <Button
                  title={
                    connected ? "Refresh health data" : "Connect health data"
                  }
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
              </Stack>
              <SettingsSection title="What syncs and how it works" collapsible>
                <ListRow
                  title="Daily movement"
                  detail="Steps, flights or floors, and active energy."
                  icon={<Footprints size={22} color={c.accent} />}
                />
                <ListRow
                  title="Sleep and weight"
                  detail="Readings from your watch or connected apps."
                  icon={<Moon size={22} color={c.accent} />}
                />
                <ListRow
                  title="Water intake"
                  detail="Synced water takes priority over manual intake for the day."
                  icon={<Droplets size={22} color={c.accent} />}
                />
                <Txt size="caption" color={c.muted}>
                  Availability depends on the apps and access you grant. Edit
                  synced records in their original app. Floors are recorded, not
                  estimated from steps. Active energy excludes resting energy
                  and is not a food allowance.
                </Txt>
              </SettingsSection>
            </>
          )}
          {view === "overview" && ready && (
            <Stack
              gap={16}
              style={{
                paddingBottom: 24,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <SectionHeading
                title="Daily overview"
                action="Health log"
                onPress={() => router.push("/health-history")}
              />
              <Row
                style={{ gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}
              >
                <Metric
                  small
                  value={
                    wellnessValue(entries, "steps") === null
                      ? "—"
                      : displayValue(wellnessValue(entries, "steps")!)
                  }
                  label="Steps today"
                />
                <Metric
                  small
                  value={highest === null ? "—" : String(highest)}
                  unit={highest === null ? undefined : "bpm"}
                  label="Recorded heart-rate peak"
                />
              </Row>
            </Stack>
          )}
          {view === "overview" && ready && (
            <SettingsSection title="Recovery readings">
              <ListRow
                title={
                  trend.latest
                    ? `${Math.round(trend.latest.value)} ms · ${trend.latest.hrvMethod}`
                    : "Heart-rate variability"
                }
                detail={trend.text}
              />
              {trend.latest && (
                <Txt size="caption" color={c.muted}>
                  {new Date(trend.latest.at).toLocaleString()} ·{" "}
                  {trend.latest.source?.provider ?? "User-entered"}
                </Txt>
              )}
              <SettingsSection title="About the baseline" collapsible>
                <Txt size="caption" color={c.muted}>
                  Daily averages use the same HRV method over 28 days. Seven
                  previous days and a reading within 36 hours are needed. This
                  is a trend, not a medical readiness score; consider sleep,
                  training and how you feel.
                </Txt>
              </SettingsSection>
            </SettingsSection>
          )}
          {view === "overview" && (
            <ListRow
              title="Heart-rate settings"
              detail="Review your recorded peak and training zones"
              icon={<Heart size={22} color={c.accent} />}
              onPress={() => router.push("/settings")}
            />
          )}
          {view === "overview" && (
            <ListRow
              title={connected ? "Health connection" : "Connect health data"}
              detail={
                connected
                  ? "Manage access and refresh your readings"
                  : "Import movement, sleep and supported readings"
              }
              icon={<Heart size={22} color={c.accent} />}
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
                {editing.entry.kind === "medication" && (
                  <>
                    <Field
                      label="Medication name"
                      value={medicationName}
                      onChangeText={setMedicationName}
                      maxLength={100}
                      editable={!pending}
                    />
                    <Field
                      label="Dose unit (mg, ml, tablet…)"
                      value={doseUnit}
                      onChangeText={setDoseUnit}
                      maxLength={30}
                      editable={!pending}
                    />
                  </>
                )}
                {editing.entry.kind === "cycle" && (
                  <Choice
                    label="Flow"
                    value={value}
                    options={[
                      { value: "1", label: "Spotting" },
                      { value: "2", label: "Light" },
                      { value: "3", label: "Medium" },
                      { value: "4", label: "Heavy" },
                    ]}
                    onChange={setValue}
                  />
                )}
                {editing.entry.kind === "bloodPressure" && (
                  <Field
                    label="Diastolic (mmHg)"
                    value={diastolic}
                    onChangeText={setDiastolic}
                    keyboardType="number-pad"
                    editable={!pending}
                  />
                )}
                {editing.entry.kind !== "cycle" && (
                  <Field
                    label={
                      editing.entry.kind === "bloodPressure"
                        ? "Systolic (mmHg)"
                        : `${wellnessMetrics[editing.entry.kind].label} (${editing.entry.kind === "medication" ? doseUnit || "dose" : wellnessMetrics[editing.entry.kind].unit})`
                    }
                    value={value}
                    onChangeText={setValue}
                    keyboardType={
                      wellnessMetrics[editing.entry.kind].whole
                        ? "number-pad"
                        : "decimal-pad"
                    }
                    editable={!pending}
                  />
                )}
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
                  <Stack gap={0}>
                    <SectionHeading title="Your readings" />
                    {!availableKinds.length && (
                      <Txt color={c.muted}>
                        Connect health data or add your first record.
                      </Txt>
                    )}
                    {availableKinds.map((kind) => {
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
                              : `${displayValue(amount)} ${wellnessUnit({ kind, source: latest?.source })}${(kind === "sleep" || kind === "weight") && latest ? ` · ${new Date(latest.at).toLocaleDateString()}` : ""}`
                          }
                        />
                      );
                    })}
                    <ListRow
                      title="Your health log"
                      onPress={() => router.push("/health-history")}
                    />
                  </Stack>
                )}
                {view === "overview" && (
                  <SettingsSection title="About these readings" collapsible>
                    <Txt size="caption" color={c.muted}>
                      Heart-rate peaks use sustained sensor readings from saved
                      workouts. Missing readings stay unrecorded. Water totals
                      use synced intake when available. Readings show their
                      source and date; sleep imports cover the last 24 hours.
                    </Txt>
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
                            Track time between a start and finish.
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
                        <Empty
                          title="Your health log starts here"
                          body="Add readings, medication or cycle records."
                        />
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
                              title={`${wellnessMetrics[entry.kind].label} · ${healthRecordValue(entry) ?? `${displayValue(entry.value)} ${wellnessUnit(entry)}`}`}
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

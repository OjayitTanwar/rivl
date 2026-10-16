import { WorkspaceExit } from "../../src/ui/WorkspaceExit";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useStore } from "../../src/state/store";
import { database } from "../../src/storage/database";
import { health } from "../../src/services/health";
import { SleepRepository } from "../../src/services/sleep-repository";
import {
  analyseSleep,
  sleepSummary,
  type SleepHistoryRead,
  type SleepStage,
} from "../../src/domain/sleep-analysis";
import {
  Screen,
  Stack,
  Row,
  Txt,
  Button,
  Notice,
  Segmented,
  ListRow,
  SectionHeading,
  Metric,
  Empty,
} from "../../src/ui/primitives";
import { SettingsSection } from "../../src/ui/SettingsSection";
import { useTheme } from "../../src/ui/theme";
import { userMessage } from "../../src/security/errors";
const repository = new SleepRepository(database);
const labels: Record<SleepStage, string> = {
  asleep: "Asleep · stage unspecified",
  core: "Core",
  light: "Light",
  deep: "Deep",
  rem: "REM",
  awake: "Awake",
  in_bed: "In bed · sleep not recorded",
  unknown: "Unspecified / conflicting",
};
const hours = (n: number) => {
  const minutes = Math.round(n * 60);
  if (n > 0 && minutes === 0) return "Under 1 min";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
const clock = (n: number) =>
  new Date(n).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
export default function Sleep() {
  const { profile } = useStore(),
    owner = profile?.id,
    { c } = useTheme(),
    ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [snapshot, setSnapshot] = useState<{
      owner: string;
      read: SleepHistoryRead | null;
    } | null>(null),
    [connected, setConnected] = useState(false),
    [days, setDays] = useState<"7" | "30">("7"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    lock = useRef(false);
  const restoredOwner = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!owner || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await database.get("health:" + owner))) {
        setConnected(false);
        if (ownerRef.current === owner) setSnapshot({ owner, read: null });
        return;
      }
      if (!health.sleepHistory)
        throw Error("Sleep history is unavailable in this build.");
      const read = await health.sleepHistory(Number(days) as 7 | 30);
      if (
        await repository.replace(owner, read, () => ownerRef.current === owner)
      ) {
        if (ownerRef.current === owner) setSnapshot({ owner, read });
      }
    } catch (e) {
      if (ownerRef.current === owner) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === owner) setBusy(false);
    }
  }, [owner, days]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!owner) {
        setLoading(false);
        return;
      }
      setLoading(restoredOwner.current !== owner);
      void Promise.all([
        repository.read(owner),
        database.get("health:" + owner),
      ])
        .then(([read, connection]) => {
          if (!active || ownerRef.current !== owner) return;
          restoredOwner.current = owner;
          setSnapshot({ owner, read });
          setConnected(!!connection);
          if (connection) void refresh();
        })
        .catch((e) => {
          if (active && ownerRef.current === owner) setError(userMessage(e));
        })
        .finally(() => {
          if (active && ownerRef.current === owner) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [owner, refresh]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && connected) void refresh();
    });
    return () => sub.remove();
  }, [connected, refresh]);
  const read = snapshot && snapshot.owner === owner ? snapshot.read : null;
  const sessions = useMemo(() => {
    if (!read) return [];
    const filtered = {
      ...read,
      from: Math.max(read.from, read.to - Number(days) * 86400000),
      intervals: read.intervals.filter(
        (r) => r.end > read.to - Number(days) * 86400000,
      ),
    };
    return analyseSleep(filtered);
  }, [read, days]);
  const summary = useMemo(() => sleepSummary(sessions), [sessions]);
  if (!owner)
    return (
      <Screen title="Sleep" action={<WorkspaceExit />}>
        <Notice text="Sign in to view your sleep history." />
      </Screen>
    );
  return (
    <Screen
      title="Sleep"
      action={<WorkspaceExit />}
      contentStyle={{ gap: 24, paddingBottom: 120 }}
    >
      {error ? <Notice text={error} /> : null}
      {loading && <Txt color={c.muted}>Loading sleep records…</Txt>}
      <Segmented
        compact
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
        ]}
        value={days}
        onChange={(v) => {
          setDays(v);
          setPage(1);
        }}
      />
      {sessions.length > 0 && (
        <ListRow
          title={connected ? "Refresh sleep history" : "Connect health data"}
          detail={
            connected
              ? busy
                ? "Reading connected sleep records…"
                : undefined
              : "Connect Apple Health or Health Connect from Health."
          }
          onPress={
            busy
              ? undefined
              : connected
                ? () => void refresh()
                : () => router.push("/health-settings")
          }
        />
      )}
      {read && read.to - read.from < Number(days) * 86400000 - 60000 ? (
        <Txt color={c.muted}>
          Stored history covers {Math.round((read.to - read.from) / 86400000)}{" "}
          days. Refresh to load the selected range.
        </Txt>
      ) : null}
      {!loading && !sessions.length ? (
        <Empty
          title="No recorded sleep yet"
          body="Sync sleep from your watch or a connected health app."
          action={
            <Button
              title={
                connected ? "Refresh sleep history" : "Connect health data"
              }
              variant="secondary"
              disabled={busy}
              loading={busy}
              onPress={
                connected
                  ? () => void refresh()
                  : () => router.push("/health-settings")
              }
              style={{ alignSelf: "flex-start" }}
            />
          }
        />
      ) : sessions.length ? (
        <Stack
          gap={16}
          style={{
            paddingBottom: 24,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <SectionHeading title="Recorded sleep" />
          <Row style={{ flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <Metric
              small
              value={
                summary.averageSleepHours === null
                  ? "—"
                  : hours(summary.averageSleepHours)
              }
              label="Average per complete session"
            />
            <Metric
              small
              value={String(summary.sessionsWithSleep)}
              label="Sessions with sleep readings"
            />
          </Row>
          <ListRow
            title="Session start variation"

            tail={
              <Txt weight="700" mono>
                {summary.startVariationMinutes === null
                  ? "Needs 3 sessions"
                  : `${Math.round(summary.startVariationMinutes)} min`}
              </Txt>
            }
          />
          <Txt size="caption" color={c.muted}>
            {read?.provider} · refreshed{" "}
            {read ? new Date(read.readAt).toLocaleString() : ""}.
          </Txt>
        </Stack>
      ) : null}
      {!!sessions.length && <SectionHeading title="Your sessions" />}
      {sessions.slice(0, page * 50).map((s) => (
        <SettingsSection
          key={s.id}
          title={new Date(s.end).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
          collapsible
        >
          <Row between style={{ flexWrap: "wrap", gap: 8 }}>
            <Txt>
              {clock(s.start)}–{clock(s.end)}
            </Txt>
            <Txt weight="700">
              {s.sleepHours === null
                ? "Sleep duration unknown"
                : hours(s.sleepHours)}
            </Txt>
          </Row>
          <Txt color={c.muted} size="caption">
            {s.partial
              ? "Partial session at history boundary"
              : "Recorded session"}{" "}
            · {s.sourceNames.join(", ")}
          </Txt>
          {s.hasConflict ? (
            <Txt color={c.muted}>
              Some sources disagree. That time remains unspecified.
            </Txt>
          ) : null}
          {(
            [
              "asleep",
              "core",
              "light",
              "deep",
              "rem",
              "awake",
              "in_bed",
              "unknown",
            ] as SleepStage[]
          )
            .filter((stage) => s.durations[stage] !== undefined)
            .map((stage) => (
              <View
                key={stage}
                style={{
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingVertical: 8,
                }}
              >
                <Row between style={{ flexWrap: "wrap", gap: 8 }}>
                  <Txt>{labels[stage]}</Txt>
                  <Txt mono>{hours(s.durations[stage]!)}</Txt>
                </Row>
              </View>
            ))}
        </SettingsSection>
      ))}
      {sessions.length > page * 50 ? (
        <Button
          variant="secondary"
          title="Show 50 more sessions"
          onPress={() => setPage((v) => v + 1)}
        />
      ) : null}
      <SettingsSection title="About sleep data" collapsible>
        <Txt color={c.muted} size="caption">
          Only supplied stages are shown. Session gaps stay separate and
          overlapping sources are counted once. Missing days remain unknown.
          Start variation includes naps and is not a sleep score.
        </Txt>
      </SettingsSection>
    </Screen>
  );
}

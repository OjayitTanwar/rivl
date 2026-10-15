import React, { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Crown } from "lucide-react-native";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Row,
  Stack,
  Segmented,
  Choice,
  Empty,
  Button,
  Field,
  Notice,
} from "../src/ui/primitives";
import { SettingsSection } from "../src/ui/SettingsSection";
import { LoadingJourney } from "../src/ui/LoadingJourney";
import RouteMap from "../src/ui/RouteMap";
import { duration, km } from "../src/domain/format";
import { useTheme } from "../src/ui/theme";
import { segmentStandings } from "../src/services/segment-history";
import {
  utcDateWindow,
  deviceSegmentStandings,
  compareSegmentPeriods,
  type EffortStanding,
  type SegmentStandingScope,
  type LeaderboardGender,
  ownerMatchesGender,
} from "../src/domain/segment-history";
import { clubs, type Club } from "../src/services/social";
import { userMessage } from "../src/security/errors";

type Mode = "fastest" | "frequent" | "compare";
const dateText = (time: number) => new Date(time).toISOString().slice(0, 10);
export default function Segments() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { segments, efforts, session, activities, profile } = useStore();
  const { c } = useTheme();
  const [selectedId, setSelectedId] = useState(params.id ?? "");
  const [mode, setMode] = useState<Mode>("fastest"),
    [scope, setScope] = useState<SegmentStandingScope>("overall");
  const [gender, setGender] = useState<LeaderboardGender>(
    profile?.leaderboardGender ?? "women",
  );
  const [period, setPeriod] = useState("all"),
    [age, setAge] = useState(
      profile?.birthYear
        ? String(new Date().getFullYear() - profile.birthYear)
        : "",
    ),
    [weight, setWeight] = useState(
      profile?.weightKg ? String(profile.weightKg) : "",
    );
  const [start, setStart] = useState(dateText(Date.now() - 30 * 86400000)),
    [end, setEnd] = useState(dateText(Date.now()));
  const [oldStart, setOldStart] = useState(
      dateText(Date.now() - 60 * 86400000),
    ),
    [oldEnd, setOldEnd] = useState(dateText(Date.now() - 31 * 86400000));
  const [joined, setJoined] = useState<Club[]>([]),
    [club, setClub] = useState("");
  const [rows, setRows] = useState<EffortStanding[]>([]),
    [before, setBefore] = useState<EffortStanding[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [loadedFor, setLoadedFor] = useState("");
  const selected = segments.find((s) => s.id === selectedId) ?? segments[0];
  const readKey = JSON.stringify([
    session?.userId,
    selected?.id,
    mode,
    scope,
    period,
    age,
    weight,
    gender,
    profile?.leaderboardGender,
    club,
    start,
    end,
    oldStart,
    oldEnd,
    revision,
  ]);
  const visibleRows = loadedFor === readKey ? rows : [];
  const visibleBefore = loadedFor === readKey ? before : [];
  useEffect(() => {
    setAge(
      profile?.birthYear
        ? String(new Date().getFullYear() - profile.birthYear)
        : "",
    );
    setWeight(profile?.weightKg ? String(profile.weightKg) : "");
    setGender(profile?.leaderboardGender ?? "women");
  }, [profile?.id]);
  const local = !session || session.local;
  useEffect(() => {
    let current = true;
    setJoined([]);
    setClub("");
    if (session && !session.local)
      void clubs(session)
        .then((list) => {
          if (current) setJoined(list.filter((item) => item.joined));
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [session?.userId]);
  useEffect(() => {
    let current = true;
    setRows([]);
    setBefore([]);
    setError("");
    setBusy(false);
    if (!selected || !session) return;
    const timer = setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const range =
            mode === "compare" || period === "custom"
              ? utcDateWindow(start, end)
              : period === "all"
                ? {}
                : {
                    since: Date.now() - (period === "week" ? 7 : 30) * 86400000,
                  };
          const previous =
            mode === "compare" ? utcDateWindow(oldStart, oldEnd) : undefined;
          if (
            scope === "age" &&
            (!age.trim() ||
              !Number.isInteger(Number(age)) ||
              Number(age) < 0 ||
              Number(age) > 125)
          )
            throw new Error("Enter an age from 0–125 to choose a group.");
          if (
            scope === "weight" &&
            (!weight.trim() ||
              Number(weight) < 25 ||
              Number(weight) > 300 ||
              !Number.isFinite(Number(weight)))
          )
            throw new Error("Enter weight from 25–300 kg to choose a group.");
          const clubId = club || joined[0]?.id;
          if (scope === "club" && !clubId)
            throw new Error("Join a club in Groups to view its standings.");
          const options = {
            age: Number(age),
            weight: Number(weight),
            club: clubId,
            frequent: mode === "frequent",
            gender,
          };
          const read = async (bounds: { since?: number; until?: number }) => {
            if (!local)
              return segmentStandings(selected.id, scope, {
                ...bounds,
                ...options,
              });
            if (
              scope === "gender" &&
              !ownerMatchesGender(profile?.leaderboardGender, gender)
            )
              return [];
            const candidates = efforts.filter(
              (e) =>
                (scope !== "age" ||
                  (e.age !== null &&
                    Math.floor(e.age / 10) === Math.floor(Number(age) / 10))) &&
                (scope !== "weight" ||
                  (e.weight != null &&
                    Math.floor(e.weight / 5) ===
                      Math.floor(Number(weight) / 5))),
            );
            return deviceSegmentStandings(
              candidates,
              session.userId,
              selected.id,
              bounds.since,
              bounds.until,
            );
          };
          const [result, earlier] = await Promise.all([
            read(
              mode === "frequent"
                ? { since: Date.now() - 90 * 86400000, until: Date.now() }
                : range,
            ),
            previous ? read(previous) : Promise.resolve([]),
          ]);
          if (current) {
            setRows(result);
            setBefore(earlier);
            setLoadedFor(readKey);
          }
        } catch (e) {
          if (current)
            setError(
              e instanceof Error && !("kind" in e) ? e.message : userMessage(e),
            );
        } finally {
          if (current) setBusy(false);
        }
      })();
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [
    selected?.id,
    session?.userId,
    local,
    mode,
    scope,
    period,
    age,
    weight,
    gender,
    profile?.leaderboardGender,
    club,
    joined,
    start,
    end,
    oldStart,
    oldEnd,
    efforts,
    revision,
    readKey,
  ]);
  const comparison = useMemo(
    () => compareSegmentPeriods(visibleBefore, visibleRows),
    [before, rows, loadedFor, readKey],
  );
  const points = useMemo(
    () =>
      selected?.points.map((p, i) => ({
        ...p,
        t: i,
        accuracy: 0,
        segment: 0,
      })) ?? [],
    [selected],
  );
  const latest = activities.find((a) => !a.demo && !a.simulated);
  return (
    <Screen title="Segments" back>
      {segments.length ? (
        <>
          <Choice
            label="Segment"
            options={segments.map((s) => ({ label: s.name, value: s.id }))}
            value={selected?.id ?? ""}
            onChange={setSelectedId}
          />
          {selected && (
            <Row between>
              <Txt color={c.muted}>
                {km(selected.distance, 2)} km · {selected.sport}
              </Txt>
              <Txt size="caption" color={c.muted}>
                {selected.ascent > 0
                  ? `${selected.ascent} m ascent`
                  : "Elevation unavailable"}
              </Txt>
            </Row>
          )}
          <Segmented
            options={[
              { label: "Fastest", value: "fastest" as const },
              { label: "Most efforts", value: "frequent" as const },
              { label: "Compare", value: "compare" as const },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Txt size="caption" color={c.muted}>
            {local
              ? "Your efforts on this device · unverified. Community crowns require server-checked public results."
              : mode === "frequent"
                ? "Local Legend · most eligible activities in the last 90 days. Ties use best time, then earliest best effort."
                : "Server-checked public efforts · up to 250 athletes per period. GPS checks cannot rule out every false recording."}
          </Txt>
          <SettingsSection
            title="Filters & dates"
            collapsible
            key={mode}
            initiallyOpen={mode === "compare"}
          >
            <Choice
              label="Athletes"
              options={[
                { label: "Everyone", value: "overall" as const },
                { label: "Friends", value: "friends" as const },
                { label: "Age group", value: "age" as const },
                { label: "Weight group", value: "weight" as const },
                { label: "Gender category", value: "gender" as const },
                { label: "Club", value: "club" as const },
              ]}
              value={scope}
              onChange={setScope}
            />
            {scope === "gender" && (
              <>
                <Choice
                  label="Gender category"
                  options={[
                    { label: "Women", value: "women" as const },
                    { label: "Men", value: "men" as const },
                    { label: "Nonbinary", value: "nonbinary" as const },
                  ]}
                  value={gender}
                  onChange={setGender}
                />
                <Txt size="caption" color={c.muted}>
                  {local
                    ? "Your current self-selected category in Settings filters your device efforts. No category is inferred."
                    : "Only athletes who explicitly share their current self-selected category are included."}
                </Txt>
              </>
            )}
            {scope === "age" && (
              <Field
                label="Age · 10-year group"
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
              />
            )}
            {scope === "weight" && (
              <Field
                label="Weight · 5 kg group"
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
              />
            )}
            {scope === "club" && joined.length > 0 && (
              <Choice
                label="Club"
                value={club || joined[0]!.id}
                options={joined.map((item) => ({
                  label: item.name,
                  value: item.id,
                }))}
                onChange={setClub}
              />
            )}
            {mode === "fastest" && (
              <Choice
                label="Period"
                options={[
                  { label: "All time", value: "all" },
                  { label: "7 days", value: "week" },
                  { label: "30 days", value: "month" },
                  { label: "Custom dates", value: "custom" },
                ]}
                value={period}
                onChange={setPeriod}
              />
            )}
            {(mode === "compare" ||
              (mode === "fastest" && period === "custom")) && (
              <>
                <Txt size="caption" color={c.muted}>
                  Dates use UTC. Finish dates are included.
                </Txt>
                {mode === "compare" && (
                  <>
                    <Field
                      label="Earlier period · start"
                      value={oldStart}
                      onChangeText={setOldStart}
                      placeholder="YYYY-MM-DD"
                    />
                    <Field
                      label="Earlier period · finish"
                      value={oldEnd}
                      onChangeText={setOldEnd}
                      placeholder="YYYY-MM-DD"
                    />
                  </>
                )}
                <Field
                  label={
                    mode === "compare" ? "Later period · start" : "Start date"
                  }
                  value={start}
                  onChangeText={setStart}
                  placeholder="YYYY-MM-DD"
                />
                <Field
                  label={
                    mode === "compare" ? "Later period · finish" : "Finish date"
                  }
                  value={end}
                  onChangeText={setEnd}
                  placeholder="YYYY-MM-DD"
                />
              </>
            )}
            {mode === "frequent" && (
              <Txt size="caption" color={c.muted}>
                The crown uses a rolling 90-day window.
              </Txt>
            )}
          </SettingsSection>
          {!!error && (
            <Notice text={error} retry={() => setRevision((n) => n + 1)} />
          )}
          {busy ? (
            <LoadingJourney compact label="Checking eligible efforts…" />
          ) : (
            !error &&
            (mode === "compare" ? (
              <>
                <Txt weight="600">Best time · earlier → later</Txt>
                {comparison.map((row) => (
                  <Stack
                    key={row.athleteId}
                    gap={6}
                    style={{
                      borderBottomWidth: 1,
                      borderColor: c.line,
                      paddingVertical: 12,
                    }}
                  >
                    <Txt weight="600">
                      {row.athlete}
                      {row.athleteId === session?.userId ? " · you" : ""}
                    </Txt>
                    <Row between>
                      <Txt mono>
                        {row.before === null ? "—" : duration(row.before)} →{" "}
                        {row.after === null ? "—" : duration(row.after)}
                      </Txt>
                      <Txt
                        mono
                        color={
                          row.improvement !== null && row.improvement > 0
                            ? c.accent
                            : c.muted
                        }
                      >
                        {row.improvement === null
                          ? "Missing period"
                          : `${Math.abs(row.improvement).toFixed(1)}% ${row.improvement >= 0 ? "faster" : "slower"}`}
                      </Txt>
                    </Row>
                  </Stack>
                ))}
                {!comparison.length && (
                  <Empty
                    title="No efforts in these periods"
                    body="Change the dates or athlete filter to compare another period."
                  />
                )}
              </>
            ) : (
              <>
                {visibleRows.map((row, i) => (
                  <Row
                    key={row.athleteId}
                    between
                    style={{
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderColor: c.line,
                    }}
                  >
                    {mode === "frequent" && i === 0 && !local ? (
                      <Crown size={22} color={c.accent} />
                    ) : (
                      <Txt mono>{i + 1}</Txt>
                    )}
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Txt weight="600">
                        {row.athlete}
                        {row.athleteId === session?.userId ? " · you" : ""}
                      </Txt>
                      <Txt size="caption" color={c.muted}>
                        {mode === "frequent"
                          ? `Best ${duration(row.seconds)}`
                          : new Date(row.date).toLocaleDateString()}
                      </Txt>
                    </Stack>
                    <Txt mono weight="600">
                      {mode === "frequent"
                        ? `${row.count} efforts`
                        : duration(row.seconds)}
                    </Txt>
                  </Row>
                ))}
                {!visibleRows.length && (
                  <Empty
                    title="No eligible efforts"
                    body="Change the filters, or record an activity along this segment. Private activities stay out of public standings."
                  />
                )}
              </>
            ))
          )}
          <SettingsSection title="Segment map" collapsible>
            <RouteMap points={points} height={240} allowMapboxFallback />
          </SettingsSection>
        </>
      ) : (
        <Empty
          title="No segments available yet"
          body="Community segments will appear when they’re available. You can already race your own recorded activities."
        />
      )}
      {latest && (
        <Button
          title="Race your latest activity"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/(tabs)/record",
              params: { ghost: latest.id },
            })
          }
        />
      )}
      <Button
        title="Find groups"
        variant="quiet"
        onPress={() => router.push("/(tabs)/community")}
      />
    </Screen>
  );
}

import { PostComments } from "../../src/ui/PostComments";
import { SafetyActions } from "../../src/ui/SafetyActions";
import { userMessage } from "../../src/security/errors";
import React, { useState, useEffect, useMemo } from "react";
import { View, Image, Share, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Heart,
  Share2,
  Flag,
  MapPin,
  ShieldCheck,
  Camera,
  ArrowRight,
  Check,
  Gauge,
  Mountain,
  TrendingUp,
} from "lucide-react-native";
import { persistPhoto } from "../../src/services/media";
import * as ImagePicker from "expo-image-picker";
import type { Sample } from "../../src/domain/types";
import { useStore } from "../../src/state/store";
import { database } from "../../src/storage/database";
import { downloadTrack } from "../../src/services/remote";
import {
  Screen,
  Txt,
  Stack,
  Row,
  Card,
  Metric,
  Button,
  Pill,
  SectionHeading,
  Empty,
  Segmented,
  Field,
  Notice,
} from "../../src/ui/primitives";
import { useTheme, brand } from "../../src/ui/theme";
import { LineChart, Trace, ProgressBar } from "../../src/ui/charts";
import RouteMap from "../../src/ui/RouteMap";
import {
  km,
  pace,
  duration,
  relative,
  speed,
  speedLabel,
} from "../../src/domain/format";
import {
  activityHighlights,
  type HighlightKind,
} from "../../src/domain/activity-highlights";
import { ExplorationCard } from "../../src/ui/ExplorationCard";
import { coachFacts, matchedActivities } from "../../src/domain/analytics";
import { explainFacts } from "../../src/services/coach";
import { distance, redactRoute } from "../../src/domain/geo";
import {
  powerCurve,
  powerZones,
  POWER_ZONE_LABELS,
  POWER_WINDOWS,
  powerDistribution,
  type PowerBest,
} from "../../src/domain/power-analysis";
import { LabelValueRow } from "../../src/ui/LabelValueRow";
import {
  recordedCyclingPowerCurve,
  RECORDED_POWER_WINDOWS,
} from "../../src/domain/power-curve";
import { historicalPower } from "../../src/services/power-history";
import { analyzeRange } from "../../src/domain/activity-ranges";
import { shareGPX } from "../../src/services/gpx";
import { paceChart } from "../../src/domain/activity-chart";
import { replayIndexAt, replayTimeline } from "../../src/domain/replay";
const NO_POWER_SAMPLES: Sample[] = [];
export default function Detail() {
  const { id, completed, gearWarning } = useLocalSearchParams<{
      id: string;
      completed?: string;
      gearWarning?: string;
    }>(),
    store = useStore(),
    { c } = useTheme(),
    a =
      store.activities.find((a) => a.id === id) ??
      store.posts.find((p) => p.activity.id === id)?.activity,
    [samples, setSamples] = useState<Sample[]>([]),
    [sampleSource, setSampleSource] = useState<string | null>(null),
    [chart, setChart] = useState<"pace" | "hr" | "elevation" | "power">("pace"),
    [selectedChartIndex, setSelectedChartIndex] = useState<number | null>(null),
    [chartRange, setChartRange] = useState<[number, number] | null>(null),
    [inspectedLap, setInspectedLap] = useState<[number, number] | null>(null),
    [rangeAnchor, setRangeAnchor] = useState<number | null>(null),
    [selectingRange, setSelectingRange] = useState(false),
    [compareHistory, setCompareHistory] = useState(false),
    [powerPeriod, setPowerPeriod] = useState<"sixWeeks" | "year" | "all">(
      "sixWeeks",
    ),
    [powerUnits, setPowerUnits] = useState<"watts" | "wkg">("watts"),
    [historySource, setHistorySource] = useState<string | null>(null),
    [historyCurve, setHistoryCurve] = useState<PowerBest[]>([]),
    [historyCount, setHistoryCount] = useState(0),
    [historyLoading, setHistoryLoading] = useState(false),
    [replayElapsed, setReplayElapsed] = useState(-1),
    [replayPlaying, setReplayPlaying] = useState(false),
    [replayWidth, setReplayWidth] = useState(1),
    [error, setError] = useState(""),
    [comment, setComment] = useState("");
  const [highlightKind, setHighlightKind] = useState<
    HighlightKind | "all" | "off"
  >("all");
  const post = store.posts.find((p) => p.activity.id === id);
  const points = samples.length ? samples : (a?.route ?? []);
  const replay = useMemo(() => replayTimeline(a?.route ?? []), [a?.route]);
  const replayFraction = Math.max(0, Math.min(1, replayElapsed / 45000));
  const replayIndex =
    replayElapsed < 0 ? -1 : replayIndexAt(replay, replayFraction);
  const rawPowerSamples =
    sampleSource === `${a?.ownerId}:${a?.id}:${a?.revision}` &&
    a?.ownerId === store.profile?.id
      ? samples
      : NO_POWER_SAMPLES;
  const measuredPower = useMemo(
    () => recordedCyclingPowerCurve(a, rawPowerSamples, store.profile?.id),
    [a, rawPowerSamples, store.profile?.id],
  );
  const powerBests = useMemo(
    () =>
      a?.sport === "ride"
        ? measuredPower.windows
            .filter((p): p is typeof p & { watts: number } => p.watts !== null)
            .map((p) => ({ ...p }))
        : powerCurve(rawPowerSamples),
    [a?.sport, measuredPower, rawPowerSamples],
  );
  const curveWindows =
    a?.sport === "ride" ? RECORDED_POWER_WINDOWS : POWER_WINDOWS;
  const comparisonSource = `${store.profile?.id}:${a?.id}:${a?.revision}:${powerPeriod}`;
  const visibleHistoryCurve =
    historySource === comparisonSource ? historyCurve : [];
  const visibleHistoryCount =
    historySource === comparisonSource ? historyCount : 0;
  const distribution = useMemo(() => powerDistribution(points), [points]);
  const highlights = useMemo(
    () => activityHighlights(samples, a?.sport ?? "run"),
    [samples, a?.sport],
  );
  const paced = useMemo(
    () => paceChart(points, a?.sport ?? "run"),
    [points, a?.sport],
  );
  useEffect(() => {
    if (!compareHistory || !a || a.ownerId !== store.profile?.id) {
      setHistoryLoading(false);
      setHistorySource(null);
      return;
    }
    let mounted = true;
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistorySource(null);
    setHistoryCurve([]);
    setHistoryCount(0);
    const since =
      powerPeriod === "sixWeeks"
        ? Date.now() - 42 * 86400000
        : powerPeriod === "year"
          ? Date.now() - 365 * 86400000
          : 0;
    void historicalPower(store.activities, a.ownerId, a.sport, since, a.id, {
      signal: controller.signal,
      canCommit: () => mounted,
    })
      .then((result) => {
        if (mounted) {
          setHistorySource(
            `${store.profile?.id}:${a.id}:${a.revision}:${powerPeriod}`,
          );
          setHistoryCurve(result.curve);
          setHistoryCount(result.count);
        }
      })
      .catch((e) => {
        if (mounted) setError(userMessage(e));
      })
      .finally(() => {
        if (mounted) setHistoryLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    compareHistory,
    powerPeriod,
    a?.id,
    a?.revision,
    store.activities,
    store.profile?.id,
  ]);
  useEffect(() => {
    if (!replayPlaying || !a?.route.length) return;
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const delta = Math.min(250, now - previous);
      previous = now;
      setReplayElapsed((elapsed) => {
        const next = Math.min(45000, Math.max(0, elapsed) + delta);
        if (next >= 45000) setReplayPlaying(false);
        return next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [replayPlaying, a?.route.length]);
  useEffect(() => {
    let mounted = true;
    setSamples([]);
    setSampleSource(null);
    void (
      a && a.ownerId === store.profile?.id
        ? downloadTrack(a)
        : Promise.resolve([])
    )
      .then((points) => {
        if (mounted) {
          setSamples(points);
          setSampleSource(`${a?.ownerId}:${a?.id}:${a?.revision}`);
        }
      })
      .catch((e) => {
        if (mounted) {
          setSampleSource(`${a?.ownerId}:${a?.id}:${a?.revision}`);
          setError(userMessage(e));
        }
      });
    return () => {
      mounted = false;
    };
  }, [id, a?.sync, a?.revision, a?.ownerId, store.profile?.id]);
  if (!a)
    return (
      <Screen title="Activity" back>
        <Empty
          title="Activity not found"
          body="It may belong to another account, or it hasn’t synced to this device."
          action={
            <Button title="Back to Today" onPress={() => router.replace("/")} />
          }
        />
      </Screen>
    );
  const s = a.summary,
    own = a.ownerId === store.profile?.id,
    powerZoneSeconds =
      own && store.profile?.ftp ? powerZones(points, store.profile.ftp) : null,
    matched = matchedActivities(a, store.activities),
    facts = coachFacts([a, ...matched]),
    values =
      chart === "hr"
        ? points.filter((p) => p.hr).map((p) => p.hr!)
        : chart === "elevation"
          ? points
              .filter((p) => p.altitude !== undefined)
              .map((p) => p.altitude!)
          : chart === "power"
            ? points.filter((p) => p.watts !== undefined).map((p) => p.watts!)
            : paced.values,
    colors = [brand.blue, brand.green, brand.yellow, brand.coral, "#B873E3"];
  const splitPointIndices: number[] = [];
  let splitTarget = 0;
  let routeMeters = 0;
  let routeIndex = 1;
  for (const split of s.splits) {
    splitTarget += split.distance;
    while (routeIndex < points.length && routeMeters < splitTarget) {
      routeMeters += distance(points[routeIndex - 1]!, points[routeIndex]!);
      routeIndex++;
    }
    splitPointIndices.push(Math.max(0, routeIndex - 1));
  }
  const chartPointIndices =
    chart === "pace"
      ? paced.indices
      : points.flatMap((point, index) =>
          (
            chart === "hr"
              ? !!point.hr
              : chart === "power"
                ? point.watts !== undefined
                : point.altitude !== undefined
          )
            ? [index]
            : [],
        );
  const selectedPoint =
    selectedChartIndex !== null
      ? points[chartPointIndices[selectedChartIndex] ?? -1]
      : undefined;
  const range = inspectedLap
    ? analyzeRange(
        points,
        inspectedLap[0],
        inspectedLap[1],
        a.sport,
        a.summary.hrZoneMaxHR ?? 190,
        a.summary.hrZoneThresholds,
        a.rpe,
      )
    : chartRange
      ? analyzeRange(
          points,
          chartPointIndices[chartRange[0]] ?? 0,
          chartPointIndices[chartRange[1]] ?? 0,
          a.sport,
          a.summary.hrZoneMaxHR ?? 190,
          a.summary.hrZoneThresholds,
          a.rpe,
        )
      : null;
  const weight = own ? store.profile?.weightKg : null;
  const powerFactor = powerUnits === "wkg" && weight ? weight : 1;
  async function act(fn: () => Promise<unknown>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError(userMessage(e));
    }
  }
  return (
    <Screen
      title={a.title}
      subtitle={new Date(a.startedAt).toLocaleString()}
      back
      action={
        <Button
          title="Share"
          variant="secondary"
          icon={<Share2 size={17} color={c.text} />}
          onPress={() =>
            own
              ? router.push({ pathname: "/story", params: { id: a.id } })
              : act(() =>
                  Share.share({
                    message: `${a.title}\n${km(s.distance)} km · ${duration(s.moving)} · ${pace(s.avgPace)} /km · ${speed(s.avgSpeed, store.profile?.speedUnit)} ${speedLabel(store.profile?.speedUnit)}\nMade with RIVL`,
                  }),
                )
          }
        />
      }
    >
      {completed === "true" && (
        <Card style={{ backgroundColor: c.soft }}>
          <Row>
            <Check size={24} color={c.good} />
            <Stack gap={4}>
              <Txt weight="700">One more line in your story.</Txt>
              <Txt size="caption" color={c.muted}>
                Activity saved on your device.
              </Txt>
            </Stack>
          </Row>
        </Card>
      )}
      {!!error && <Notice text={error} />}
      <RouteMap
        allowMapboxFallback
        points={range?.points ?? a.route}
        reference={range ? a.route : undefined}
        height={340}
        highlights={
          range || highlightKind === "off"
            ? []
            : highlights
                .filter(
                  (h) => highlightKind === "all" || h.kind === highlightKind,
                )
                .map((h) => ({
                  ...h,
                  color:
                    h.kind === "fastest"
                      ? brand.blue
                      : h.kind === "climb"
                        ? brand.yellow
                        : brand.green,
                }))
        }
        waypoints={
          selectedPoint
            ? [selectedPoint]
            : replayIndex >= 0 && a.route.length
              ? [a.route[Math.min(replayIndex, a.route.length - 1)]!]
              : []
        }
      />
      {!!highlights.length && (
        <>
          <Segmented
            options={[
              { label: "All highlights", value: "all" as const },
              ...highlights.map((h) => ({ label: h.title, value: h.kind })),
              { label: "Clean map", value: "off" as const },
            ]}
            value={highlightKind}
            onChange={setHighlightKind}
          />
          <Row style={{ flexWrap: "wrap" }}>
            {highlights.map((h) => (
              <Row key={h.kind} style={{ minWidth: 150 }}>
                {h.kind === "fastest" ? (
                  <Gauge size={20} color={c.blue} />
                ) : h.kind === "climb" ? (
                  <TrendingUp size={20} color={c.text} />
                ) : (
                  <Mountain size={20} color={c.good} />
                )}
                <Stack gap={2}>
                  <Txt size="caption" color={c.muted}>
                    {h.title}
                  </Txt>
                  <Txt weight="700" mono>
                    {h.kind === "fastest"
                      ? `${speed(h.value, store.profile?.speedUnit)} ${speedLabel(store.profile?.speedUnit)}`
                      : `${Math.round(h.value)} m`}
                  </Txt>
                </Stack>
              </Row>
            ))}
          </Row>
          <Txt size="caption" color={c.muted}>
            Blue: fastest sustained 30-second stretch. Yellow: most climbing in
            a 30-second stretch. Green: highest recorded point. GPS and altitude
            accuracy affect these estimates.
          </Txt>
        </>
      )}
      {own && (
        <Button
          title="Edit activity"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: "/activity-edit", params: { id: a.id } })
          }
        />
      )}
      {own && !a.demo && !a.simulated && (
        <Button
          title="Activity gear"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: "/gear", params: { activity: id } })
          }
        />
      )}
      {gearWarning === "1" && (
        <Notice text="Activity saved. Gear could not be linked; choose Activity gear to retry." />
      )}
      {completed === "true" && own && (
        <ExplorationCard completed activityId={a.id} />
      )}
      {a.route.length > 2 && (
        <Row style={{ flexWrap: "wrap" }}>
          {own && (
            <Button
              title="Export GPX"
              variant="quiet"
              onPress={() =>
                void act(() =>
                  shareGPX(
                    a.title,
                    redactRoute(points, store.profile!.privacyZones).flatMap(
                      (line, segment) => line.map((p) => ({ ...p, segment })),
                    ),
                    true,
                  ),
                )
              }
            />
          )}
          <Button
            title={
              replayPlaying
                ? "Pause replay"
                : replayElapsed >= 45000
                  ? "Replay again"
                  : "Play route"
            }
            variant="secondary"
            onPress={() => {
              if (replayPlaying) setReplayPlaying(false);
              else {
                if (replayElapsed >= 45000 || replayElapsed < 0)
                  setReplayElapsed(0);
                setReplayPlaying(true);
              }
            }}
          />
          {replayElapsed >= 0 && (
            <Txt size="caption" color={c.muted}>
              {replay.timed
                ? `${duration((replay.recordedMs * replayFraction) / 1000)} / ${duration(replay.recordedMs / 1000)} recorded`
                : `${Math.round(replayFraction * 100)}% of route`}
            </Txt>
          )}
        </Row>
      )}
      {a.route.length > 2 && replayElapsed >= 0 && (
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Replay position"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(replayFraction * 100),
          }}
          onLayout={(event) => setReplayWidth(event.nativeEvent.layout.width)}
          onPress={(event) =>
            setReplayElapsed(
              Math.round(
                Math.max(
                  0,
                  Math.min(1, event.nativeEvent.locationX / replayWidth),
                ) * 45000,
              ),
            )
          }
          style={{ height: 18, justifyContent: "center" }}
        >
          <View style={{ height: 5, borderRadius: 4, backgroundColor: c.soft }}>
            <View
              style={{
                width: `${replayFraction * 100}%`,
                height: 5,
                borderRadius: 4,
                backgroundColor: brand.coral,
              }}
            />
          </View>
        </Pressable>
      )}
      <Row between>
        <Pill>
          {a.demo ? "SIMULATED ACTIVITY" : a.visibility.toUpperCase()}
        </Pill>
        <Txt size="caption" color={c.muted}>
          {a.sync === "synced"
            ? "Synced"
            : a.sync === "local"
              ? "Saved on this device"
              : "Saved locally · sync pending"}
        </Txt>
      </Row>
      <Card>
        <Row style={{ flexWrap: "wrap" }}>
          <Metric value={km(s.distance, 2)} unit="km" label="Distance" />
          <Metric value={duration(s.moving)} label="Moving time" />
          <Metric value={pace(s.avgPace)} unit="/km" label="Average pace" />
          <Metric
            value={speed(s.avgSpeed, store.profile?.speedUnit)}
            unit={speedLabel(store.profile?.speedUnit)}
            label="Average speed"
          />
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          <Metric
            small
            value={Math.round(s.ascent).toString()}
            unit="m"
            label="Elevation gain"
          />
          <Metric
            small
            value={s.avgHR ? Math.round(s.avgHR).toString() : "—"}
            unit={s.avgHR ? "bpm" : undefined}
            label="Average heart rate"
          />
          <Metric
            small
            value={Math.round(s.load).toString()}
            label="Training load"
          />
        </Row>
      </Card>
      <Card style={{ backgroundColor: c.soft }}>
        <Txt size="micro" weight="700" style={{ letterSpacing: 1 }}>
          THE RIVL READ
        </Txt>
        <Txt style={{ lineHeight: 25 }}>{explainFacts(facts)}</Txt>
        <Txt size="micro" color={c.muted}>
          Deterministic facts · {facts.evidence} comparable activities
        </Txt>
      </Card>
      <Stack>
        <SectionHeading title="Every part of the effort" />
        <Segmented
          options={[
            { label: "Pace", value: "pace" },
            { label: "Heart rate", value: "hr" },
            { label: "Elevation", value: "elevation" },
            { label: "Power", value: "power" },
          ]}
          value={chart}
          onChange={(next) => {
            setChart(next);
            setSelectedChartIndex(null);
            setInspectedLap(null);
            setChartRange(null);
            setRangeAnchor(null);
            setSelectingRange(false);
          }}
        />
        <Card>
          {values.length ? (
            <LineChart
              series={[
                {
                  label: chart,
                  values,
                  color: chart === "hr" ? brand.coral : brand.blue,
                },
              ]}
              height={180}
              labels={["Start", "End"]}
              selectedIndex={selectedChartIndex}
              selectedRange={chartRange}
              onSelect={(index) => {
                setReplayPlaying(false);
                setReplayElapsed(-1);
                setSelectedChartIndex(index);
                if (selectingRange) {
                  if (rangeAnchor === null) setRangeAnchor(index);
                  else if (index !== rangeAnchor) {
                    setChartRange([
                      Math.min(index, rangeAnchor),
                      Math.max(index, rangeAnchor),
                    ]);
                    setRangeAnchor(null);
                    setSelectingRange(false);
                  }
                }
              }}
            />
          ) : (
            <Empty
              title="No sensor data"
              body="This activity has no samples for this measurement. RIVL never fills in missing health or power readings."
            />
          )}
          {values.length > 1 && (
            <Row style={{ flexWrap: "wrap" }}>
              <Button
                title={
                  selectingRange
                    ? rangeAnchor === null
                      ? "Tap the first chart point"
                      : "Tap the last chart point"
                    : "Select chart range"
                }
                variant="quiet"
                onPress={() => {
                  setInspectedLap(null);
                  setSelectingRange(!selectingRange);
                  setRangeAnchor(null);
                  setChartRange(null);
                }}
              />
              {range && (
                <Button
                  title="Clear range"
                  variant="quiet"
                  onPress={() => {
                    setChartRange(null);
                    setInspectedLap(null);
                  }}
                />
              )}
            </Row>
          )}
          {range && (
            <View style={{ gap: 10 }}>
              <Row style={{ flexWrap: "wrap" }}>
                <Metric
                  small
                  label="Selected distance"
                  value={km(range.summary.distance, 2)}
                  unit="km"
                />
                <Metric
                  small
                  label="Selected moving time"
                  value={duration(range.summary.moving)}
                />
                <Metric
                  small
                  label="Selected climb"
                  value={String(Math.round(range.summary.ascent))}
                  unit="m"
                />
              </Row>
              <Txt size="caption" color={c.muted}>
                Average HR{" "}
                {range.summary.avgHR
                  ? Math.round(range.summary.avgHR) + " bpm"
                  : "—"}{" "}
                · average power{" "}
                {range.summary.avgPower != null
                  ? Math.round(range.summary.avgPower) + " W"
                  : "—"}
              </Txt>
            </View>
          )}
          {selectedPoint && selectedChartIndex !== null && (
            <Txt size="caption" color={c.muted}>
              {chart === "pace"
                ? `Pace: ${pace(values[selectedChartIndex] ?? 0)} /km`
                : `${chart === "hr" ? "Heart rate" : chart === "power" ? "Power" : "Elevation"}: ${Math.round(values[selectedChartIndex] ?? 0)} ${chart === "hr" ? "bpm" : chart === "power" ? "W" : "m"}`}{" "}
              · shown on map
            </Txt>
          )}
          <Row>
            <Metric small value={duration(s.elapsed)} label="Elapsed time" />
            <Metric
              small
              value={s.gap ? pace(s.gap) : "—"}
              unit="/km"
              label="Grade-adjusted estimate"
            />
            {s.avgPower !== null && (
              <Metric
                small
                value={Math.round(s.avgPower).toString()}
                unit="W"
                label="Average power"
              />
            )}
          </Row>
        </Card>
      </Stack>
      {(powerBests.length > 0 ||
        (own && a.sport === "ride" && !a.demo && !a.simulated)) && (
        <Stack>
          <SectionHeading title="Power curve" />
          <Card>
            {weight && (
              <Segmented
                options={[
                  { label: "Watts", value: "watts" },
                  { label: "Watts/kg", value: "wkg" },
                ]}
                value={powerUnits}
                onChange={setPowerUnits}
              />
            )}
            {(powerBests.length > 0 || visibleHistoryCurve.length > 0) && (
              <View
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <LineChart
                  series={[
                    {
                      label: "Best average watts",
                      values: curveWindows.map(
                        (seconds) =>
                          (powerBests.find((best) => best.seconds === seconds)
                            ?.watts ?? NaN) / powerFactor,
                      ),
                      color: brand.coral,
                    },
                    ...(compareHistory && visibleHistoryCurve.length
                      ? [
                          {
                            label: "Historical best",
                            values: curveWindows.map(
                              (seconds) =>
                                (visibleHistoryCurve.find(
                                  (best) => best.seconds === seconds,
                                )?.watts ?? NaN) / powerFactor,
                            ),
                            color: brand.blue,
                          },
                        ]
                      : []),
                  ]}
                  labels={
                    a.sport === "ride"
                      ? ["5 sec", "Duration", "20 min"]
                      : ["1 sec", "Duration", "2 hr"]
                  }
                  height={160}
                />
              </View>
            )}
            <Stack gap={12}>
              {curveWindows.map((seconds) => {
                const best = powerBests.find((p) => p.seconds === seconds);
                const historical = compareHistory
                  ? visibleHistoryCurve.find((p) => p.seconds === seconds)
                  : undefined;
                const formatted = (watts: number) =>
                  powerUnits === "wkg" && weight
                    ? `${(watts / weight).toFixed(2)} W/kg`
                    : `${watts} W`;
                return (
                  <LabelValueRow
                    key={seconds}
                    label={
                      seconds < 60
                        ? `${seconds} seconds`
                        : `${seconds / 60} minutes`
                    }
                    value={`${best ? formatted(best.watts) : "Unavailable"}${historical ? ` · History ${formatted(historical.watts)}` : ""}`}
                    muted={!best}
                  />
                );
              })}
              {a.sport === "ride" && (
                <Txt size="caption" color={c.muted}>
                  {sampleSource === null
                    ? "Loading raw power readings…"
                    : measuredPower.status === "limit"
                      ? "This track exceeds the 100,000-sample comparison limit. No partial best is shown."
                      : "Unavailable durations do not have enough continuous measured coverage. Real zero-watt readings are retained."}
                </Txt>
              )}
            </Stack>
            {own && (
              <>
                <Button
                  title={
                    compareHistory
                      ? "Hide historical comparison"
                      : "Compare with history"
                  }
                  variant="secondary"
                  loading={historyLoading && !compareHistory}
                  onPress={() => setCompareHistory(!compareHistory)}
                />
                {historyLoading && (
                  <Txt size="caption" color={c.muted}>
                    Loading historical power… You can hide the comparison to
                    cancel.
                  </Txt>
                )}
                {compareHistory && (
                  <>
                    <Segmented
                      options={[
                        { label: "6 weeks", value: "sixWeeks" },
                        { label: "Year", value: "year" },
                        { label: "All time", value: "all" },
                      ]}
                      value={powerPeriod}
                      onChange={setPowerPeriod}
                    />
                    <Txt size="caption" color={c.muted}>
                      Coral: this activity · blue: best from{" "}
                      {visibleHistoryCount} earlier activities with measured
                      power, among the latest 50 eligible recorded activities in
                      this period.
                    </Txt>
                  </>
                )}
              </>
            )}
            <Txt size="micro" color={c.muted}>
              Best rolling averages from owner-recorded raw power only. Pauses
              and missing readings are excluded; cycling intervals require valid
              endpoints no more than 2.5 seconds apart.
              {powerUnits === "wkg" && weight
                ? ` Watts/kg uses your current ${weight} kg weight.`
                : ""}
            </Txt>
          </Card>
        </Stack>
      )}
      {distribution.length > 0 && (
        <Stack>
          <SectionHeading title="25-watt distribution" />
          <Card>
            {distribution.map((bin) => (
              <Row key={bin.watts}>
                <Txt size="caption" style={{ width: 95 }}>
                  {bin.watts}–{bin.watts + 24} W
                </Txt>
                <View style={{ flex: 1 }}>
                  <ProgressBar
                    value={
                      bin.seconds /
                      (distribution.reduce((sum, b) => sum + b.seconds, 0) || 1)
                    }
                    color={brand.blue}
                  />
                </View>
                <Txt mono size="caption">
                  {duration(bin.seconds)}
                </Txt>
              </Row>
            ))}
          </Card>
        </Stack>
      )}
      {!!s.laps?.length && (
        <Stack>
          <SectionHeading title="Recorded laps" />
          <Card>
            {s.laps.map((lap, i) => (
              <View key={lap.start} style={{ gap: 6 }}>
                <Row between>
                  <Txt weight="700">Lap {i + 1}</Txt>
                  <Txt mono>
                    {km(lap.distance, 2)} km · {duration(lap.seconds)}
                  </Txt>
                </Row>
                <Txt size="caption" color={c.muted}>
                  {Math.round(lap.ascent)} m climb ·{" "}
                  {lap.avgHR ? Math.round(lap.avgHR) + " bpm" : "No HR"} ·{" "}
                  {lap.avgPower != null
                    ? Math.round(lap.avgPower) + " W"
                    : "No power"}
                </Txt>
                <Button
                  title={`Inspect lap ${i + 1}`}
                  variant="quiet"
                  onPress={() => {
                    const first = points.findIndex((p) => p.t >= lap.start),
                      last = points.findLastIndex((p) => p.t <= lap.end);
                    setSelectedChartIndex(null);
                    setChartRange(null);
                    setRangeAnchor(null);
                    setSelectingRange(false);
                    if (first >= 0 && last > first)
                      setInspectedLap([first, last]);
                  }}
                />
              </View>
            ))}
          </Card>
        </Stack>
      )}
      {own && powerBests.length > 0 && (
        <Stack>
          <SectionHeading title="Power zones" />
          <Card>
            {powerZoneSeconds ? (
              <>
                <Txt size="caption" color={c.muted}>
                  Based on your {store.profile!.ftp} W FTP. Only measured power
                  intervals count.
                </Txt>
                {powerZoneSeconds.map((seconds, i) => (
                  <Row key={i}>
                    <Txt size="caption" style={{ width: 100 }}>
                      Z{i + 1} · {POWER_ZONE_LABELS[i]}
                    </Txt>
                    <View style={{ flex: 1 }}>
                      <ProgressBar
                        value={
                          seconds /
                          (powerZoneSeconds.reduce((sum, n) => sum + n, 0) || 1)
                        }
                        color={colors[i % colors.length]!}
                      />
                    </View>
                    <Txt
                      mono
                      size="caption"
                      style={{ width: 55, textAlign: "right" }}
                    >
                      {duration(seconds)}
                    </Txt>
                  </Row>
                ))}
              </>
            ) : (
              <>
                <Txt color={c.muted}>
                  Add your measured FTP in Settings to see power zones for this
                  activity.
                </Txt>
                <Button
                  title="Set FTP"
                  variant="secondary"
                  onPress={() => router.push("/settings")}
                />
              </>
            )}
          </Card>
        </Stack>
      )}
      <Stack>
        <SectionHeading title="Splits" />
        <Card>
          <Row between>
            <Txt size="caption" color={c.muted}>
              KM
            </Txt>
            <Txt size="caption" color={c.muted}>
              PACE / KM
            </Txt>
          </Row>
          {s.splits.length ? (
            s.splits.map((split, i) => (
              <View key={i} style={{ gap: 5 }}>
                <Row>
                  <Txt mono style={{ width: 36 }}>
                    {split.distance < 990
                      ? km(split.distance, 2)
                      : String(split.km)}
                  </Txt>
                  <View style={{ flex: 1 }}>
                    <ProgressBar
                      value={
                        Math.min(...s.splits.map((p) => p.pace)) /
                        (split.pace || 1)
                      }
                      color={brand.blue}
                    />
                  </View>
                  <Txt
                    mono
                    weight="600"
                    style={{ width: 60, textAlign: "right" }}
                  >
                    {pace(split.pace)}
                  </Txt>
                </Row>
                <Txt size="micro" color={c.muted} style={{ marginLeft: 48 }}>
                  {duration(split.seconds)} moving · {Math.round(split.ascent)}{" "}
                  m climb
                  {i > 0 &&
                  split.distance >= 990 &&
                  s.splits[i - 1]!.distance >= 990
                    ? ` · ${Math.abs(Math.round(split.pace - s.splits[i - 1]!.pace))} sec/km ${split.pace < s.splits[i - 1]!.pace ? "faster" : split.pace > s.splits[i - 1]!.pace ? "slower" : "same"} than previous`
                    : ""}
                </Txt>
              </View>
            ))
          ) : (
            <Txt color={c.muted}>Move a little farther to see splits.</Txt>
          )}
        </Card>
      </Stack>
      <Stack>
        <SectionHeading title="Heart-rate zones" />
        <Card>
          <Txt size="caption" color={c.muted}>
            {s.hrZoneThresholds
              ? `Personal boundaries saved with this activity: ${s.hrZoneThresholds.join(" / ")} bpm.`
              : s.hrZoneMaxHR
                ? `Default zones calculated using a maximum of ${s.hrZoneMaxHR} bpm when saved.`
                : "Saved zone totals. The original maximum heart rate was not retained."}
          </Txt>
          {s.avgHR ? (
            s.zones.map((seconds, i) => (
              <Row key={i}>
                <Txt size="caption" style={{ width: 54 }}>
                  Zone {i + 1}
                </Txt>
                <View style={{ flex: 1 }}>
                  <ProgressBar
                    value={seconds / (s.moving || 1)}
                    color={colors[i]}
                  />
                </View>
                <Txt
                  mono
                  size="caption"
                  style={{ width: 48, textAlign: "right" }}
                >
                  {duration(seconds)}
                </Txt>
              </Row>
            ))
          ) : (
            <Txt color={c.muted}>
              Connect a heart-rate source for zone analysis.
            </Txt>
          )}
          <Txt size="micro" color={c.muted}>
            Load method:{" "}
            {s.loadMethod === "hr-zones"
              ? "zone-weighted minutes"
              : "session duration × perceived effort"}
            . This is a training estimate.
          </Txt>
        </Card>
      </Stack>
      {s.bests.length > 0 && (
        <Stack>
          <SectionHeading title="Best efforts" />
          <Row style={{ flexWrap: "wrap" }}>
            {s.bests.map((b) => (
              <Card key={b.distance} style={{ flex: 1, minWidth: 125 }}>
                <Pill background={brand.yellow} color={brand.ink}>
                  {b.distance === 1609.344
                    ? "1 MILE"
                    : b.distance < 1000
                      ? b.distance + " M"
                      : km(b.distance, 0) + " KM"}
                </Pill>
                <Txt mono size="heading" weight="700">
                  {duration(b.seconds)}
                </Txt>
              </Card>
            ))}
          </Row>
        </Stack>
      )}
      {!!a.note && (
        <Card>
          <Txt size="subheading" weight="700">
            Field notes
          </Txt>
          <Txt>{a.note}</Txt>
        </Card>
      )}
      {own && (
        <Row style={{ flexWrap: "wrap" }}>
          <Button
            title="Race this effort"
            variant="secondary"
            icon={<Flag size={18} color={c.text} />}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/record",
                params: { ghost: a.id },
              })
            }
          />
          <Button
            title="Save as route"
            variant="secondary"
            icon={<MapPin size={18} color={c.text} />}
            onPress={() =>
              act(async () => {
                await store.saveRoute({
                  id: "from-" + a.id,
                  name: a.title,
                  sport: a.sport,
                  points: a.route,
                  distance: s.distance,
                  ascent: s.ascent,
                  surface: "From your activity",
                  saved: true,
                });
                router.push("/routes");
              })
            }
          />
        </Row>
      )}
      {own && (
        <Card>
          <SectionHeading title="Visibility" />
          <Segmented
            options={[
              { label: "Only you", value: "private" },
              { label: "Friends", value: "friends" },
              { label: "Everyone", value: "public" },
            ]}
            value={a.visibility}
            onChange={(visibility) =>
              void act(() =>
                store.saveActivity({
                  ...a,
                  visibility,
                  revision: a.revision + 1,
                }),
              )
            }
          />
          <Txt size="caption" color={c.muted}>
            Shared routes hide 200 m around both endpoints and your privacy
            zones.
          </Txt>
          {a.visibility !== "private" && (
            <RouteMap
              allowMapboxFallback
              points={[]}
              lines={redactRoute(points, store.profile?.privacyZones ?? [])}
              height={190}
            />
          )}
        </Card>
      )}
      <Stack>
        <SectionHeading title="Photos" />
        {a.photos.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            style={{ height: 230, borderRadius: 16 }}
            accessibilityLabel="Workout photo"
          />
        ))}
        {own && (
          <Button
            variant="secondary"
            title="Add a photo"
            icon={<Camera size={18} color={c.text} />}
            onPress={() =>
              act(async () => {
                const permission =
                  await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!permission.granted)
                  throw new Error("Allow photo access to attach an image.");
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ["images"],
                  quality: 0.8,
                });
                if (!result.canceled)
                  await store.saveActivity({
                    ...a,
                    photos: [
                      ...a.photos,
                      await persistPhoto(result.assets[0]!.uri, a.ownerId),
                    ],
                    revision: a.revision + 1,
                  });
              })
            }
          />
        )}
      </Stack>
      {matched.length > 0 && (
        <Card>
          <SectionHeading title="Matched activities" />
          {matched.slice(0, 3).map((m) => (
            <Button
              key={m.id}
              variant="quiet"
              title={`${relative(m.startedAt)} · ${pace(m.summary.avgPace)} /km`}
              onPress={() =>
                router.push({
                  pathname: "/activity/[id]",
                  params: { id: m.id },
                })
              }
            />
          ))}
        </Card>
      )}
      {post && (
        <Card>
          <SafetyActions
            id={post.id}
            owner={post.activity.ownerId}
            name={post.athlete}
          />
          <Button
            title={
              post.reactions.includes(store.session!.userId)
                ? "Cheered"
                : "Give a cheer"
            }
            variant="secondary"
            icon={<Heart size={18} color={c.accent} />}
            onPress={() => store.react(post.id)}
          />
          <PostComments
            key={store.session!.userId + ":" + post.id}
            post={post}
            session={store.session!}
          />
          <Field
            label="Leave a comment"
            value={comment}
            onChangeText={setComment}
          />
          <Button
            title="Post comment"
            disabled={!comment.trim()}
            onPress={async () => {
              await store.comment(post.id, comment);
              setComment("");
            }}
          />
        </Card>
      )}
    </Screen>
  );
}

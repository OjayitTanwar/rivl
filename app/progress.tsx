import React, { useMemo, useState } from "react";
import { View, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Map, Target, ChevronRight } from "lucide-react-native";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Stack,
  Row,
  Metric,
  Segmented,
  SectionHeading,
  Button,
  Empty,
  Choice,
  ListRow,
} from "../src/ui/primitives";
import { LineChart, ProgressBar } from "../src/ui/charts";
import { useTheme, brand } from "../src/ui/theme";
import {
  trainingHistory,
  records,
  predictRace,
  DAY,
  dateKey,
} from "../src/domain/analytics";
import type { Sport } from "../src/domain/types";
import { km, duration } from "../src/domain/format";
import { ActivityRow } from "../src/ui/ActivityRow";

export default function Progress() {
  const { activities } = useStore(),
    { c } = useTheme();
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");
  const [sport, setSport] = useState<Sport | "all">("all");
  const [section, setSection] = useState<"overview" | "analysis">("overview");
  const [chart, setChart] = useState<"distance" | "load">("distance");
  const [day, setDay] = useState<string | null>(null);
  const wide = useWindowDimensions().width > 1100;
  const days = period === "week" ? 7 : period === "month" ? 30 : 365;
  const actual = useMemo(
    () =>
      activities.filter(
        (activity) =>
          !activity.simulated && (sport === "all" || activity.sport === sport),
      ),
    [activities, sport],
  );
  const history = useMemo(() => trainingHistory(actual, days), [actual, days]);
  const last = history[history.length - 1];
  const filtered = useMemo(
    () =>
      actual.filter(
        (a) =>
          a.startedAt >= Date.now() - days * DAY && a.startedAt <= Date.now(),
      ),
    [actual, days],
  );
  const best = useMemo(() => records(activities), [activities]);
  const zones = useMemo(
    () =>
      filtered.reduce(
        (sum, a) => sum.map((v, i) => v + (a.summary.zones[i] ?? 0)),
        [0, 0, 0, 0, 0],
      ),
    [filtered],
  );
  const zoneTotal = zones.reduce((s, v) => s + v, 0);
  const calendar = useMemo(() => trainingHistory(actual, 35), [actual]);
  const selected = useMemo(
    () => (day ? actual.filter((a) => dateKey(a.startedAt) === day) : []),
    [actual, day],
  );
  const range = `${new Date(Date.now() - (days - 1) * DAY).toLocaleDateString(undefined, { month: "short", day: "numeric", year: period === "year" ? "numeric" : undefined })} – Today`;
  const flatSection = {
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: c.line,
    gap: 16,
  };
  return (
    <Screen title="Progress" back contentStyle={{ gap: 24 }}>
      <Stack gap={12}>
        <Segmented
          options={[
            { label: "Overview", value: "overview" },
            { label: "Analysis", value: "analysis" },
          ]}
          value={section}
          onChange={setSection}
        />
        <Row style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
          <Txt size="subheading" weight="700">
            Training
          </Txt>
          <Choice
            label="Sport"
            options={[
              { label: "All sports", value: "all" },
              { label: "Run", value: "run" },
              { label: "Ride", value: "ride" },
              { label: "Walk", value: "walk" },
              { label: "Hike", value: "hike" },
            ]}
            value={sport}
            onChange={(value) => {
              setSport(value);
              setDay(null);
            }}
          />
        </Row>
        <Segmented
          options={[
            { label: "Week", value: "week" },
            { label: "Month", value: "month" },
            { label: "Year", value: "year" },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <Txt size="caption" color={c.muted}>
          {range} · last {days} days
        </Txt>
      </Stack>
      <Row style={{ flexWrap: "wrap", paddingBottom: 4 }}>
        <Metric
          small
          value={km(filtered.reduce((sum, a) => sum + a.summary.distance, 0))}
          unit="km"
          label="Distance"
        />
        <Metric
          small
          value={duration(
            filtered.reduce((sum, a) => sum + a.summary.moving, 0),
          )}
          label="Moving time"
        />
        <Metric small value={String(filtered.length)} label="Activities" />
      </Row>
      {section === "overview" ? (
        <>
          <Stack style={flatSection}>
            <SectionHeading title="Training over time" />
            <Segmented
              options={[
                { label: "Distance", value: "distance" },
                { label: "Training load", value: "load" },
              ]}
              value={chart}
              onChange={setChart}
            />
            <LineChart
              series={[
                {
                  label:
                    chart === "distance" ? "Distance (km)" : "Training load",
                  values: history.map((h) =>
                    chart === "distance" ? h.distance / 1000 : h.load,
                  ),
                  color: c.accent,
                },
              ]}
              height={190}
              labels={[history[0]?.date.slice(5) ?? "", "Today"]}
            />
            {!filtered.length && (
              <Txt size="caption" color={c.muted}>
                No recorded activities in this period. Choose another period or
                record an outing.
              </Txt>
            )}
          </Stack>
          <Stack style={flatSection}>
            <SectionHeading
              title="Training calendar"
              action="History"
              onPress={() => router.push("/history")}
            />
            <ScrollView
              horizontal
              contentContainerStyle={{ flexGrow: 1 }}
              showsHorizontalScrollIndicator={false}
            >
              <View style={{ width: "100%", minWidth: 364 }}>
                <Row style={{ gap: 0, paddingBottom: 8 }}>
                  {calendar.slice(0, 7).map((h) => (
                    <Txt
                      key={h.date}
                      size="caption"
                      color={c.muted}
                      style={{ width: "14.285%", textAlign: "center" }}
                    >
                      {new Date(`${h.date}T12:00:00`).toLocaleDateString(
                        undefined,
                        { weekday: "short" },
                      )}
                    </Txt>
                  ))}
                </Row>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {calendar.map((h) => (
                    <View key={h.date} style={{ width: "14.285%", padding: 2 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: day === h.date }}
                        accessibilityLabel={`${h.date}: ${(h.distance / 1000).toFixed(1)} kilometres`}
                        onPress={() => setDay(day === h.date ? null : h.date)}
                        style={({ pressed }) => ({
                          minHeight: 48,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: h.load ? c.primary : c.soft,
                          borderWidth: day === h.date ? 2 : 0,
                          borderColor: c.text,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Txt
                          mono
                          size="caption"
                          weight="600"
                          color={h.load ? brand.ink : c.muted}
                        >
                          {Number(h.date.slice(-2))}
                        </Txt>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
            <Txt size="caption" color={c.muted}>
              Last 35 days · coral marks training · select a day
            </Txt>
            {day && (
              <Stack gap={12}>
                <Txt weight="600">
                  {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                  })}
                </Txt>
                {selected.length ? (
                  selected.map((a) => <ActivityRow key={a.id} activity={a} />)
                ) : (
                  <Txt color={c.muted}>No recorded activity this day.</Txt>
                )}
              </Stack>
            )}
          </Stack>
          <Button
            title="View training analysis"
            variant="secondary"
            onPress={() => setSection("analysis")}
          />
        </>
      ) : (
        <>
          <Stack style={flatSection}>
            <SectionHeading title="Fitness, fatigue & form" />
            <Row style={{ flexWrap: "wrap" }}>
              <Metric
                small
                value={
                  actual.length
                    ? Math.round(last?.fitness ?? 0).toString()
                    : "—"
                }
                label="Fitness · 42 days"
                color={c.good}
              />
              <Metric
                small
                value={
                  actual.length
                    ? Math.round(last?.fatigue ?? 0).toString()
                    : "—"
                }
                label="Fatigue · 7 days"
                color={c.accent}
              />
              <Metric
                small
                value={
                  actual.length ? Math.round(last?.form ?? 0).toString() : "—"
                }
                label="Form · fitness − fatigue"
                color={c.blue}
              />
            </Row>
            <LineChart
              series={[
                {
                  label: "Fitness",
                  values: history.map((h) => h.fitness),
                  color: brand.green,
                },
                {
                  label: "Fatigue",
                  values: history.map((h) => h.fatigue),
                  color: c.accent,
                },
                {
                  label: "Form",
                  values: history.map((h) => h.form),
                  color: brand.blue,
                },
              ]}
              height={220}
              labels={[history[0]?.date.slice(5) ?? "", "Today"]}
            />
            <Txt size="caption" color={c.muted}>
              Exponentially weighted training load, including rest days. Form
              describes the balance of recent work; it does not measure medical
              readiness.
            </Txt>
          </Stack>
          <View style={{ flexDirection: wide ? "row" : "column", gap: 24 }}>
            <Stack style={{ flex: 1 }}>
              <Stack style={flatSection}>
                <SectionHeading title="Time in heart-rate zones" />
                {zones.map((v, i) => (
                  <Row key={i} style={{ flexWrap: "wrap" }}>
                    <Txt size="caption" style={{ width: 52 }}>
                      Zone {i + 1}
                    </Txt>
                    <View style={{ flex: 1, minWidth: 80 }}>
                      <ProgressBar
                        value={v / (zoneTotal || 1)}
                        color={
                          [
                            brand.blue,
                            brand.green,
                            brand.yellow,
                            brand.coral,
                            "#B873E3",
                          ][i]
                        }
                      />
                    </View>
                    <Txt
                      mono
                      size="caption"
                      style={{ minWidth: 55, textAlign: "right" }}
                    >
                      {Math.round(v / 60)} min
                    </Txt>
                  </Row>
                ))}
                {!zoneTotal && (
                  <Txt size="caption" color={c.muted}>
                    Connect health data or record with a heart-rate source.
                  </Txt>
                )}
              </Stack>
            </Stack>
            <Stack style={{ flex: 1, gap: 24 }}>
              <Stack style={flatSection}>
                <SectionHeading title="Running records" />
                <Txt size="caption" color={c.muted}>
                  All-time best continuous efforts · running
                </Txt>
                {best.length ? (
                  best.map((b) => (
                    <Pressable
                      key={b.distance}
                      accessibilityRole="button"
                      accessibilityLabel={`Best ${b.distance} metres, ${duration(b.seconds)}. Open activity.`}
                      onPress={() =>
                        router.push({
                          pathname: "/activity/[id]",
                          params: { id: b.activity.id },
                        })
                      }
                      style={({ pressed }) => ({
                        minHeight: 56,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: c.line,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Row style={{ flexWrap: "wrap" }}>
                        <Txt weight="600" style={{ flex: 1, minWidth: 90 }}>
                          {b.distance === 1609.344
                            ? "1 mile"
                            : b.distance < 1000
                              ? b.distance + " m"
                              : km(b.distance, 0) + " km"}
                        </Txt>
                        <Txt size="subheading" mono weight="700">
                          {duration(b.seconds)}
                        </Txt>
                        <ChevronRight size={18} color={c.muted} />
                      </Row>
                    </Pressable>
                  ))
                ) : (
                  <Empty
                    title="No running records yet"
                    body="Continuous recorded running efforts become benchmarks here."
                  />
                )}
              </Stack>
              <Stack style={flatSection}>
                <SectionHeading title="Race predictions" />
                <Txt size="caption" color={c.muted}>
                  From running efforts in the last 60 days
                </Txt>
                {[5000, 10000, 21097.5, 42195].map((distance) => {
                  const estimate = predictRace(activities, distance);
                  return (
                    <Row
                      between
                      key={distance}
                      style={{ flexWrap: "wrap", paddingVertical: 4 }}
                    >
                      <Txt style={{ flex: 1, minWidth: 140 }}>
                        {distance === 21097.5
                          ? "Half marathon"
                          : distance === 42195
                            ? "Marathon"
                            : km(distance, 0) + "K"}
                      </Txt>
                      <Txt mono weight="600">
                        {estimate ? duration(estimate) : "—"}
                      </Txt>
                    </Row>
                  );
                })}
                <Txt size="caption" color={c.muted}>
                  Riegel estimates from recent efforts. Longer extrapolations
                  carry more uncertainty.
                </Txt>
              </Stack>
            </Stack>
          </View>
        </>
      )}
      <Stack gap={0} style={flatSection}>
        <ListRow
          title="Personal heatmap"
          detail="See where you train"
          icon={<Map size={22} color={c.muted} />}
          onPress={() => router.push("/heatmap")}
        />
        <ListRow
          title="Weekly goal"
          detail="Edit your distance target"
          icon={<Target size={22} color={c.muted} />}
          onPress={() => router.push("/settings")}
        />
      </Stack>
    </Screen>
  );
}

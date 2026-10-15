import React, { useMemo } from "react";
import { router } from "expo-router";
import {
  Bell,
  Compass,
  ChevronRight,
  Route,
  ChartNoAxesCombined,
  Heart,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useStore } from "../../../src/state/store";
import {
  Screen,
  Txt,
  Row,
  Stack,
  Button,
  Metric,
  SectionHeading,
  IconButton,
  Empty,
  Notice,
  ListRow,
} from "../../../src/ui/primitives";
import { useTheme } from "../../../src/ui/theme";
import { ActivityFeedCard } from "../../../src/ui/ActivityFeedCard";
import { weeklyStats, dateKey } from "../../../src/domain/analytics";
import { explorationProgress } from "../../../src/domain/exploration";
import { km, duration } from "../../../src/domain/format";

export default function Home() {
  const { activities, profile, online } = useStore();
  const { c } = useTheme();
  const actual = useMemo(
    () =>
      activities
        .filter((a) => !a.demo && !a.simulated)
        .sort((a, b) => b.startedAt - a.startedAt),
    [activities],
  );
  const stats = useMemo(() => weeklyStats(actual), [actual]);
  const exploration = useMemo(() => explorationProgress(actual), [actual]);
  const goal = profile?.weeklyGoal ?? 40000;
  const goalProgress = goal > 0 ? Math.min(1, stats.distance / goal) : 0;
  const today = dateKey(Date.now());
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    const key = dateKey(day.getTime());
    return {
      key,
      date: day.getDate(),
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
      count: stats.activities.filter((a) => dateKey(a.startedAt) === key)
        .length,
    };
  });

  return (
    <Screen
      title="Activity"
      back
      contentStyle={{ gap: 24, paddingBottom: 120 }}
      action={
        <IconButton
          label="Notifications"
          onPress={() => router.push("/notifications")}
        >
          <Bell size={22} color={c.text} />
        </IconButton>
      }
    >
      {!online && (
        <Notice text="You’re offline. Recording and saved training are available." />
      )}
      <ListRow
        title="Health log"
        detail="Steps, sleep, water and heart rate"
        icon={<Heart size={22} color={c.accent} />}
        onPress={() => router.push("/health-log")}
      />
      <Stack
        gap={16}
        style={{
          paddingBottom: 24,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
        }}
      >
        <SectionHeading
          title="This week"
          action="Progress"
          onPress={() => router.push("/progress")}
        />
        <Row style={{ gap: 16 }}>
          <Metric small value={km(stats.distance)} unit="km" label="Distance" />
          <Metric small value={duration(stats.moving)} label="Moving time" />
          <Metric
            small
            value={String(stats.activities.length)}
            label="Activities"
          />
        </Row>
        <Stack gap={8}>
          <Row between style={{ flexWrap: "wrap", gap: 4 }}>
            <Txt size="caption" color={c.muted}>
              {goal > 0
                ? `${km(stats.distance)} of ${km(goal, 0)} km weekly goal`
                : "Set your weekly distance goal"}
            </Txt>
            {goal > 0 && (
              <Txt size="caption" mono weight="600">
                {Math.round((stats.distance / goal) * 100)}%
              </Txt>
            )}
          </Row>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Weekly distance goal"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(goalProgress * 100),
            }}
            style={{ height: 4, backgroundColor: c.line }}
          >
            <View
              style={{
                height: 4,
                width: `${goalProgress * 100}%`,
                backgroundColor: c.accent,
              }}
            />
          </View>
        </Stack>
        <Row style={{ gap: 8, alignItems: "stretch" }}>
          {week.map((day) => (
            <Stack
              key={day.key}
              gap={6}
              style={{ flex: 1, alignItems: "center" }}
            >
              <Txt size="caption" color={c.muted}>
                {day.label}
              </Txt>
              <View
                accessible
                accessibilityLabel={`${day.label} ${day.date}: ${day.count} ${day.count === 1 ? "activity" : "activities"}${day.key === today ? ", today" : ""}`}
                style={{
                  minWidth: 32,
                  minHeight: 32,
                  padding: 4,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  backgroundColor: day.count ? c.text : c.soft,
                  borderWidth: day.key === today ? 1 : 0,
                  borderColor: c.accent,
                }}
              >
                <Txt
                  size="caption"
                  mono
                  weight="600"
                  color={day.count ? c.bg : c.text}
                >
                  {day.date}
                </Txt>
              </View>
            </Stack>
          ))}
        </Row>
      </Stack>
      <Stack gap={0}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore your map"
          onPress={() => router.navigate("/maps")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingBottom: 20,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Compass size={26} color={c.accent} />
          <Stack gap={3} style={{ flex: 1 }}>
            <Txt weight="700">Explore your map</Txt>
            <Txt size="caption" color={c.muted}>
              Level {exploration.level} · {exploration.tiles.length} tiles
              explored · {exploration.streak} day streak
            </Txt>
          </Stack>
          <ChevronRight size={20} color={c.muted} />
        </Pressable>
        <Row
          style={{
            gap: 0,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: c.line,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Routes: find or plan a route"
            onPress={() => router.push("/routes")}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingRight: 12,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Route size={19} color={c.text} />
            <Txt weight="600" style={{ flex: 1 }}>
              Routes
            </Txt>
            <ChevronRight size={16} color={c.muted} />
          </Pressable>
          <View style={{ width: 1, height: 24, backgroundColor: c.line }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Training and personal bests"
            onPress={() => router.push("/progress")}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingLeft: 12,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <ChartNoAxesCombined size={19} color={c.text} />
            <Txt weight="600" style={{ flex: 1 }}>
              Training
            </Txt>
            <ChevronRight size={16} color={c.muted} />
          </Pressable>
        </Row>
      </Stack>
      <Stack gap={0}>
        <SectionHeading
          title="Your activities"
          action="See all"
          onPress={() => router.push("/history")}
        />
        {actual.length ? (
          actual
            .slice(0, 5)
            .map((a) => <ActivityFeedCard key={a.id} activity={a} />)
        ) : (
          <Empty
            title="Your first activity starts here"
            body="Record a run, ride, walk or hike. Your routes and training will appear here."
            action={
              <Button
                title="Record an activity"
                onPress={() => router.navigate("/record")}
                style={{ alignSelf: "flex-start" }}
              />
            }
          />
        )}
      </Stack>
    </Screen>
  );
}

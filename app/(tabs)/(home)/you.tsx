import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  Settings,
  Bike,
  Radio,
  PlayCircle,
  Trophy,
  Mountain,
  Target,
  Compass,
  ChevronRight,
  Check,
  Heart,
} from "lucide-react-native";
import { useStore } from "../../../src/state/store";
import {
  Screen,
  Txt,
  Stack,
  Row,
  Metric,
  SectionHeading,
  Button,
  ListRow,
  Empty,
} from "../../../src/ui/primitives";
import { ProgressBar } from "../../../src/ui/charts";
import { useTheme } from "../../../src/ui/theme";
import { progression, records } from "../../../src/domain/analytics";
import { km, duration } from "../../../src/domain/format";
import { ActivityRow } from "../../../src/ui/ActivityRow";
import { explorationProgress } from "../../../src/domain/exploration";

export default function You() {
  const { profile, activities } = useStore();
  const { c } = useTheme();
  const [tab, setTab] = useState<"activities" | "progress">("activities");
  const actual = useMemo(
    () =>
      activities
        .filter((a) => !a.demo && !a.simulated)
        .sort((a, b) => b.startedAt - a.startedAt),
    [activities],
  );
  const p = useMemo(() => progression(actual), [actual]);
  const exploration = useMemo(() => explorationProgress(actual), [actual]);
  const best = useMemo(() => records(actual), [actual]);
  const monthly = useMemo(() => {
    const now = new Date();
    return actual.filter((a) => {
      const date = new Date(a.startedAt);
      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    });
  }, [actual]);
  const initials = (profile?.name || "You")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const achievements = [
    {
      title: "First line",
      earned: actual.length > 0,
      detail: "Your first activity",
      Icon: Target,
    },
    {
      title: "Century legs",
      earned: p.distance >= 100000,
      detail: "100 km of real work",
      Icon: Trophy,
    },
    {
      title: "Uphill from here",
      earned: p.ascent >= 1000,
      detail: "1,000 m climbed",
      Icon: Mountain,
    },
  ];

  return (
    <Screen
      title="You"
      back
      contentStyle={{ gap: 24, paddingBottom: 120 }}
      action={
        <Button
          title="Settings"
          variant="quiet"
          icon={<Settings size={19} color={c.text} />}
          onPress={() => router.push("/settings")}
          style={{ paddingHorizontal: 0 }}
        />
      }
    >
      <Stack gap={12}>
        <Row style={{ gap: 16 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: c.soft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt size="subheading" weight="700">
              {initials}
            </Txt>
          </View>
          <Stack gap={3} style={{ flex: 1 }}>
            <Txt size="heading" weight="700">
              {profile?.name || "Your profile"}
            </Txt>
            {!!profile?.handle && (
              <Txt size="caption" color={c.muted}>
                @{profile.handle}
              </Txt>
            )}
          </Stack>
        </Row>
        {!!profile?.bio && (
          <Txt color={c.muted} numberOfLines={2}>
            {profile.bio}
          </Txt>
        )}
      </Stack>
      <Stack
        gap={0}
        style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }}
      >
        <ListRow
          title="Gear · shoes & bikes"
          detail="Equipment and mileage"
          icon={<Bike size={23} color={c.text} />}
          onPress={() => router.push("/gear")}
        />
        <View style={{ height: 1, backgroundColor: c.line }} />
        <ListRow
          title="Automatic recording"
          detail="Choose when exercise starts a recording"
          icon={<PlayCircle size={23} color={c.text} />}
          onPress={() => router.push("/auto-record")}
        />
        <View style={{ height: 1, backgroundColor: c.line }} />
        <ListRow
          title="Health log"
          detail="Water, weight, sleep, steps and fasting"
          icon={<Heart size={23} color={c.text} />}
          onPress={() => router.push("/health-log")}
        />
        <View style={{ height: 1, backgroundColor: c.line }} />
        <ListRow
          title="Devices & sensors"
          detail="Manage your training connections"
          icon={<Radio size={23} color={c.text} />}
          onPress={() => router.push("/devices")}
        />
      </Stack>
      <Row style={{ gap: 0, borderBottomWidth: 1, borderBottomColor: c.line }}>
        {(
          [
            { value: "activities", label: "Activities" },
            { value: "progress", label: "Progress" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: tab === item.value }}
            onPress={() => setTab(item.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 2,
              borderBottomColor: tab === item.value ? c.accent : "transparent",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Txt weight="700" color={tab === item.value ? c.text : c.muted}>
              {item.label}
            </Txt>
          </Pressable>
        ))}
      </Row>
      {tab === "activities" ? (
        <Stack gap={24}>
          <Stack gap={16}>
            <SectionHeading
              title="This month"
              action="History"
              onPress={() => router.push("/history")}
            />
            <Row style={{ gap: 16 }}>
              <Metric
                small
                value={km(
                  monthly.reduce((sum, a) => sum + a.summary.distance, 0),
                )}
                unit="km"
                label="Distance"
              />
              <Metric
                small
                value={duration(
                  monthly.reduce((sum, a) => sum + a.summary.moving, 0),
                )}
                label="Moving time"
              />
              <Metric small value={String(monthly.length)} label="Activities" />
            </Row>
          </Stack>
          <Stack gap={0}>
            <SectionHeading
              title="Recent activities"
              action="See all"
              onPress={() => router.push("/history")}
            />
            {actual.length ? (
              actual
                .slice(0, 5)
                .map((a) => <ActivityRow key={a.id} activity={a} />)
            ) : (
              <Empty
                title="Make your first move"
                body="Your recorded activities and monthly totals will appear here."
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
        </Stack>
      ) : (
        <Stack gap={32}>
          <Stack gap={16}>
            <SectionHeading
              title="All time"
              action="Full progress"
              onPress={() => router.push("/progress")}
            />
            <Row style={{ gap: 16 }}>
              <Metric
                small
                value={km(p.distance, 0)}
                unit="km"
                label="Distance"
              />
              <Metric small value={String(actual.length)} label="Activities" />
              <Metric
                small
                value={String(Math.round(p.ascent))}
                unit="m"
                label="Climbed"
              />
            </Row>
          </Stack>
          <Stack gap={16}>
            <SectionHeading title="Training profile" />
            {[
              { label: "Endurance", value: p.endurance },
              { label: "Speed", value: p.speed },
              { label: "Hills", value: p.hills },
              { label: "Consistency", value: p.consistency },
            ].map((item) => (
              <Stack key={item.label} gap={8}>
                <Row between>
                  <Txt weight="600">{item.label}</Txt>
                  <Txt size="caption" mono color={c.muted}>
                    {item.value} / 100
                  </Txt>
                </Row>
                <ProgressBar value={item.value / 100} color={c.accent} />
              </Stack>
            ))}
            <Txt size="caption" color={c.muted}>
              Based on distance, 5K performance, elevation and active days.
            </Txt>
          </Stack>
          <Stack gap={0}>
            <SectionHeading
              title="Personal records"
              action="All progress"
              onPress={() => router.push("/progress")}
            />
            {best.slice(0, 5).map((b) => (
              <View
                key={b.distance}
                style={{ borderBottomWidth: 1, borderBottomColor: c.line }}
              >
                <ListRow
                  title={
                    b.distance === 1609.344
                      ? "1 mile"
                      : b.distance < 1000
                        ? `${b.distance} m`
                        : `${km(b.distance, 0)} km`
                  }
                  tail={
                    <Row style={{ gap: 12 }}>
                      <Txt mono weight="700">
                        {duration(b.seconds)}
                      </Txt>
                      <ChevronRight size={17} color={c.muted} />
                    </Row>
                  }
                  onPress={() =>
                    router.push({
                      pathname: "/activity/[id]",
                      params: { id: b.activity.id },
                    })
                  }
                />
              </View>
            ))}
            {!best.length && (
              <Txt color={c.muted} style={{ paddingTop: 12 }}>
                Record a continuous run to start your record book.
              </Txt>
            )}
          </Stack>
          <Stack gap={16}>
            <SectionHeading
              title="Exploration"
              action="Maps"
              onPress={() => router.navigate("/maps")}
            />
            <Row style={{ gap: 16 }}>
              <Metric small value={String(exploration.level)} label="Level" />
              <Metric
                small
                value={String(exploration.tiles.length)}
                label="Tiles explored"
              />
              <Metric
                small
                value={String(exploration.streak)}
                label="Day streak"
              />
            </Row>
            <ListRow
              title="Your exploration map"
              detail={`${exploration.xp} XP · ${exploration.nextXP - exploration.xp} XP to level ${exploration.level + 1}`}
              icon={<Compass size={23} color={c.accent} />}
              onPress={() => router.push("/heatmap")}
            />
          </Stack>
          <Stack gap={0}>
            <SectionHeading title="Achievements" />
            {achievements.map((a) => (
              <View
                key={a.title}
                style={{ borderBottomWidth: 1, borderBottomColor: c.line }}
              >
                <ListRow
                  title={a.title}
                  detail={a.detail}
                  icon={
                    <a.Icon size={23} color={a.earned ? c.accent : c.muted} />
                  }
                  tail={
                    a.earned ? (
                      <Row style={{ gap: 4 }}>
                        <Check size={15} color={c.good} />
                        <Txt size="caption" color={c.good}>
                          Earned
                        </Txt>
                      </Row>
                    ) : (
                      <Txt size="caption" color={c.muted}>
                        In progress
                      </Txt>
                    )
                  }
                />
              </View>
            ))}
            {exploration.rewards
              .filter((r) => r.unlocked && !r.style)
              .map((reward) => (
                <ListRow
                  key={reward.title}
                  title={reward.title}
                  detail="Exploration reward"
                  icon={<Compass size={23} color={c.accent} />}
                  tail={
                    <Txt size="caption" color={c.good}>
                      Earned
                    </Txt>
                  }
                />
              ))}
          </Stack>
        </Stack>
      )}
    </Screen>
  );
}

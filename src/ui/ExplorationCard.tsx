import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Compass, Flame, ArrowUpRight } from "lucide-react-native";
import { router } from "expo-router";
import { useStore } from "../state/store";
import { explorationProgress } from "../domain/exploration";
import { brand, useTheme } from "./theme";
import { Card, Row, Txt, Button } from "./primitives";
export function XPBar({ value }: { value: number }) {
  const { c, reduceMotion } = useTheme();
  const width = useRef(
    new Animated.Value(reduceMotion ? Math.max(0, Math.min(1, value)) : 0),
  ).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: Math.max(0, Math.min(1, value)),
      duration: reduceMotion ? 0 : 650,
      easing: Easing.out(Easing.exp),
      useNativeDriver: false,
    }).start();
  }, [value, reduceMotion, width]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        height: 8,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: c.line,
      }}
    >
      <Animated.View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: brand.coral,
          width: width.interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          }),
        }}
      />
    </View>
  );
}
export function ExplorationCard({
  completed = false,
  activityId,
}: {
  completed?: boolean;
  activityId?: string;
}) {
  const { activities } = useStore(),
    { c } = useTheme();
  const progress = useMemo(() => explorationProgress(activities), [activities]);
  const before = useMemo(
    () =>
      activityId
        ? explorationProgress(activities.filter((a) => a.id !== activityId))
        : null,
    [activities, activityId],
  );
  const next = progress.rewards.find((r) => !r.unlocked);
  return (
    <Card>
      <Row between>
        <Row>
          <Compass size={24} color={c.accent} />
          <Txt size="heading" weight="700">
            {completed ? "Your world is growing" : "Explore your world"}
          </Txt>
        </Row>
        <Txt weight="700">Lv {progress.level}</Txt>
      </Row>
      {before && (
        <Txt weight="700" color={c.good}>
          +{progress.tiles.length - before.tiles.length} new tiles · +
          {progress.xp - before.xp} XP
        </Txt>
      )}
      <Row between style={{ flexWrap: "wrap" }}>
        <Txt weight="600">
          {progress.tiles.length} tiles explored · {progress.xp} XP
        </Txt>
        <Row>
          <Flame size={18} color={c.accent} />
          <Txt size="caption">{progress.streak} active-day streak</Txt>
        </Row>
      </Row>
      <XPBar value={progress.levelProgress} />
      <Txt size="caption" color={c.muted}>
        {next
          ? `${Math.max(0, next.tiles - progress.tiles.length)} new tiles to ${next.title.toLowerCase()}`
          : "Expedition badge earned"}{" "}
        · {progress.nextXP - progress.xp} XP to level {progress.level + 1}
      </Txt>
      <Button
        title="Open exploration map"
        variant="secondary"
        icon={<ArrowUpRight size={18} color={c.text} />}
        onPress={() => router.push("/heatmap")}
      />
    </Card>
  );
}

import { useStore } from "../state/store";
import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Footprints, Bike, Mountain, ChevronRight } from "lucide-react-native";
import type { Activity } from "../domain/types";
import { Txt, Row, Stack } from "./primitives";
import { useTheme, brand } from "./theme";
import {
  km,
  pace,
  relative,
  duration,
  speed,
  speedLabel,
} from "../domain/format";
import { Trace } from "./charts";
export function ActivityRow({ activity: a }: { activity: Activity }) {
  const { profile } = useStore();
  const { c } = useTheme(),
    Icon =
      a.sport === "ride" ? Bike : a.sport === "hike" ? Mountain : Footprints;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.title}
      onPress={() =>
        router.push({ pathname: "/activity/[id]", params: { id: a.id } })
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          backgroundColor: c.soft,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {a.route.length ? (
          <Trace points={a.route} size={57} />
        ) : (
          <Icon size={25} color={c.text} />
        )}
      </View>
      <Stack style={{ flex: 1 }} gap={5}>
        <Txt size="micro" color={c.muted}>
          {relative(a.startedAt)} · {a.sport.toUpperCase()}
        </Txt>
        <Txt weight="600" numberOfLines={2}>
          {a.title}
        </Txt>
        <Txt size="caption" color={c.muted}>
          {km(a.summary.distance)} km ·{" "}
          {a.sport === "ride"
            ? `${speed(a.summary.avgSpeed, profile?.speedUnit)} ${speedLabel(profile?.speedUnit)}`
            : `${pace(a.summary.avgPace)} /km`}{" "}
          · {duration(a.summary.moving)}
        </Txt>
      </Stack>
      <ChevronRight size={17} color={c.muted} />
    </Pressable>
  );
}

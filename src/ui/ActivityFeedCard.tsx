import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  Bike,
  Footprints,
  Mountain,
  ChevronRight,
  Share2,
} from "lucide-react-native";
import type { Activity } from "../domain/types";
import {
  duration,
  km,
  pace,
  relative,
  speed,
  speedLabel,
} from "../domain/format";
import { useStore } from "../state/store";
import RouteMap from "./RouteMap";
import { Row, Txt, Stack, Metric, Button } from "./primitives";
import { useTheme } from "./theme";
export function ActivityFeedCard({ activity: a }: { activity: Activity }) {
  const { c } = useTheme(),
    { profile } = useStore();
  const Icon =
    a.sport === "ride" ? Bike : a.sport === "hike" ? Mountain : Footprints;
  const open = () =>
    router.push({ pathname: "/activity/[id]", params: { id: a.id } });
  return (
    <Stack
      gap={14}
      style={{
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <Row>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.soft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={20} color={c.text} />
        </View>
        <Stack gap={2} style={{ flex: 1 }}>
          <Txt weight="600">{profile?.name ?? "Your activity"}</Txt>
          <Txt size="caption" color={c.muted}>
            {relative(a.startedAt)} · {a.sport}
          </Txt>
        </Stack>
        <ChevronRight size={18} color={c.muted} />
      </Row>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${a.title}`}
        onPress={open}
        style={{ gap: 12 }}
      >
        <Txt size="heading" weight="700">
          {a.title}
        </Txt>
        <Row>
          <Metric
            small
            value={km(a.summary.distance)}
            unit="km"
            label="Distance"
          />
          <Metric
            small
            value={
              a.sport === "ride"
                ? speed(a.summary.avgSpeed, profile?.speedUnit)
                : pace(a.summary.avgPace)
            }
            unit={a.sport === "ride" ? speedLabel(profile?.speedUnit) : "/km"}
            label={a.sport === "ride" ? "Avg speed" : "Avg pace"}
          />
          <Metric small value={duration(a.summary.moving)} label="Time" />
        </Row>
      </Pressable>
      {!!a.route.length && (
        <RouteMap
          points={a.route}
          interactive={false}
          height={220}
          borderRadius={0}
        />
      )}
      <Row between>
        <Txt size="caption" color={c.muted}>
          {Math.round(a.summary.ascent)} m climbed
        </Txt>
        <Button
          title="Share story"
          variant="quiet"
          icon={<Share2 size={17} color={c.text} />}
          style={{ minHeight: 44, paddingVertical: 8 }}
          onPress={() =>
            router.push({ pathname: "/story", params: { id: a.id } })
          }
        />
      </Row>
    </Stack>
  );
}

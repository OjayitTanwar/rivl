import React, { memo, useMemo, useState } from "react";
import { routePreviewPath } from "../domain/route-preview";
import { Pressable, View } from "react-native";
import Svg, {
  Path,
  Line,
  Circle,
  Polyline,
  Text as SvgText,
  Rect,
} from "react-native-svg";
import type { Sample } from "../domain/types";
import { brand, useTheme } from "./theme";
import { chartSamples } from "../domain/display";
import { Txt, Row } from "./primitives";
export function LineChart({
  series,
  height = 140,
  labels = [],
  onSelect,
  selectedIndex,
  selectedRange,
}: {
  series: { values: number[]; color: string; label: string }[];
  height?: number;
  labels?: string[];
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
  selectedRange?: [number, number] | null;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(1);
  const bounded = series.map((s) => ({ ...s, points: chartSamples(s.values) }));
  let min = 0,
    max = 1;
  for (const s of bounded)
    for (const p of s.points) {
      min = Math.min(min, p.value);
      max = Math.max(max, p.value);
    }
  const y = (n: number) =>
    height - 18 - ((n - min) / (max - min)) * (height - 32);
  return (
    <View
      accessibilityRole={onSelect ? undefined : "image"}
      accessibilityLabel={series
        .map(
          (s) =>
            s.label + ": " + Math.round(s.values[s.values.length - 1] ?? 0),
        )
        .join(". ")}
    >
      <Pressable
        disabled={!onSelect}
        accessibilityRole={onSelect ? "button" : undefined}
        accessibilityLabel={
          onSelect ? "Chart. Tap a point to show it on the map." : undefined
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onPress={(event) => {
          const length = series[0]?.values.length ?? 0;
          if (onSelect && length)
            onSelect(
              Math.max(
                0,
                Math.min(
                  length - 1,
                  Math.round(
                    (event.nativeEvent.locationX / width) * (length - 1),
                  ),
                ),
              ),
            );
        }}
      >
        <Svg
          width="100%"
          height={height}
          viewBox={`0 0 500 ${height}`}
          preserveAspectRatio="none"
        >
          {[0.25, 0.5, 0.75].map((n) => (
            <Line
              key={n}
              x1="0"
              y1={height * n}
              x2="500"
              y2={height * n}
              stroke={c.line}
              strokeDasharray="3 6"
            />
          ))}
          {selectedRange && (
            <Rect
              x={
                (Math.min(...selectedRange) /
                  ((series[0]?.values.length ?? 1) - 1 || 1)) *
                500
              }
              y={0}
              width={
                (Math.abs(selectedRange[1] - selectedRange[0]) /
                  ((series[0]?.values.length ?? 1) - 1 || 1)) *
                500
              }
              height={height}
              fill={brand.blue}
              opacity={0.15}
            />
          )}
          {bounded.map((s) => (
            <Polyline
              key={s.label}
              points={s.points
                .map(
                  (p) =>
                    `${(p.index / (s.values.length - 1 || 1)) * 500},${y(p.value)}`,
                )
                .join(" ")}
              stroke={s.color}
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {selectedIndex !== null &&
            selectedIndex !== undefined &&
            (series[0]?.values.length ?? 0) > 0 && (
              <Line
                x1={
                  (selectedIndex / ((series[0]?.values.length ?? 1) - 1 || 1)) *
                  500
                }
                x2={
                  (selectedIndex / ((series[0]?.values.length ?? 1) - 1 || 1)) *
                  500
                }
                y1={0}
                y2={height}
                stroke={c.accent}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )}
        </Svg>
      </Pressable>
      {labels.length > 0 && (
        <Row between>
          {labels.map((l, i) => (
            <Txt key={i} size="micro" color={c.muted}>
              {l}
            </Txt>
          ))}
        </Row>
      )}
    </View>
  );
}
export const Trace = memo(function Trace({
  points,
  color,
  size = 180,
}: {
  points?: Sample[];
  color?: string;
  size?: number;
}) {
  const { c } = useTheme();
  const path = useMemo(
    () =>
      points?.length
        ? routePreviewPath(points, 200, 200)
        : "M28 154 C 8 96 76 171 69 108 S 40 16 113 41 S 186 132 134 167 S 75 139 111 104 S 192 30 167 20",
    [points],
  );
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      accessibilityElementsHidden
    >
      <Path
        d={path}
        stroke={color ?? c.accent}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={path}
        transform="translate(3 2)"
        stroke={color ?? c.accent}
        strokeWidth=".6"
        opacity=".45"
        fill="none"
      />
    </Svg>
  );
});
export function Bars({
  values,
  labels,
  color,
}: {
  values: number[];
  labels: string[];
  color?: string;
}) {
  const { c } = useTheme(),
    max = Math.max(1, ...values);
  return (
    <Row style={{ height: 130, alignItems: "flex-end", gap: 8 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, gap: 8, alignItems: "center" }}>
          <View
            accessibilityLabel={`${labels[i]}: ${v.toFixed(1)}`}
            style={{
              height: Math.max(4, (v / max) * 95),
              width: "100%",
              maxWidth: 42,
              borderRadius: 5,
              backgroundColor: v ? color : c.line,
            }}
          />
          <Txt size="micro" color={c.muted}>
            {labels[i]}
          </Txt>
        </View>
      ))}
    </Row>
  );
}
export function ProgressBar({
  value,
  color,
}: {
  value: number;
  color?: string;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(value * 100), min: 0, max: 100 }}
      style={{
        height: 6,
        backgroundColor: c.line,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(100, value * 100))}%`,
          height: 6,
          backgroundColor: color ?? c.primary,
          borderRadius: 3,
        }}
      />
    </View>
  );
}

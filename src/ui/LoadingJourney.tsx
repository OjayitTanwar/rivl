import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { Bike, Footprints, Navigation2 } from "lucide-react-native";
import { Txt } from "./primitives";
import { useTheme } from "./theme";
import { useFullScreenLoading } from "./loading-state";
let sequence = 0;
/** Small vector animation; no bundled video, artificial delay, or motion when disabled. */
export function LoadingJourney({
  label = "Getting things ready…",
  compact = false,
  large = false,
  fullScreen = false,
}: {
  label?: string;
  compact?: boolean;
  large?: boolean;
  fullScreen?: boolean;
}) {
  const { c, reduceMotion } = useTheme();
  const covered = useFullScreenLoading(fullScreen, label);
  const size = large ? 1.7 : 1;
  const [variant] = useState(() => sequence++ % 3);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || covered) {
      progress.setValue(0.5);
      return;
    }
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    motion.start();
    return () => motion.stop();
  }, [progress, reduceMotion, covered]);
  const Icon = variant === 0 ? Bike : variant === 1 ? Footprints : Navigation2;
  const x = progress.interpolate({
    inputRange:
      variant === 2
        ? [0, 0.55, 0.8, 1]
        : variant === 1
          ? [0, 0.2, 0.4, 0.6, 0.8, 1]
          : [0, 1],
    outputRange:
      variant === 2
        ? [8, 88, 88, 112]
        : variant === 1
          ? [8, 28, 28, 72, 72, 104]
          : [8, 104],
  });
  const y = progress.interpolate({
    inputRange: variant === 2 ? [0, 0.55, 0.8, 1] : [0, 0.25, 0.5, 0.75, 1],
    outputRange:
      variant === 2
        ? [0, 0, -16, -16]
        : variant === 1
          ? [0, -7, 0, -7, 0]
          : [0, -1, 0, -1, 0],
  });
  const tilt = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange:
      variant === 1
        ? ["-8deg", "8deg", "-8deg", "8deg", "-8deg"]
        : ["0deg", "0deg", "0deg", "0deg", "0deg"],
  });
  if (covered) return null;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ text: "Loading" }}
      style={{ gap: 8, alignItems: "center", padding: compact ? 8 : 20 }}
    >
      <View
        style={{
          width: 140 * size,
          height: 44 * size,
          justifyContent: "flex-end",
        }}
      >
        {variant === 2 ? (
          <>
            <View
              style={{
                position: "absolute",
                bottom: 0 * size,
                left: 8 * size,
                width: 94 * size,
                height: 2 * size,
                backgroundColor: c.line,
              }}
            />
            <View
              style={{
                position: "absolute",
                bottom: 0 * size,
                left: 100 * size,
                width: 2 * size,
                height: 18 * size,
                backgroundColor: c.line,
              }}
            />
            <View
              style={{
                position: "absolute",
                bottom: 16 * size,
                left: 100 * size,
                width: 36 * size,
                height: 2 * size,
                backgroundColor: c.line,
              }}
            />
          </>
        ) : (
          <View
            style={{
              height: 2 * size,
              backgroundColor: c.line,
              borderRadius: 2,
            }}
          />
        )}
        <Animated.View
          style={{
            position: "absolute",
            left: 0 * size,
            bottom: 5 * size,
            transform: [
              { translateX: Animated.multiply(x, size) },
              { translateY: Animated.multiply(y, size) },
              { rotate: tilt },
            ],
          }}
        >
          <Icon size={28 * size} color={c.accent} strokeWidth={1.8} />
          {variant === 0 && (
            <Animated.View
              style={{
                position: "absolute",
                left: 12 * size,
                bottom: 8 * size,
                width: 7 * size,
                height: 2 * size,
                backgroundColor: c.accent,
                transform: [
                  {
                    rotate: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "720deg"],
                    }),
                  },
                ],
              }}
            />
          )}
        </Animated.View>
      </View>
      <Txt
        size={large ? "heading" : "caption"}
        weight={large ? "600" : "400"}
        color={large ? c.text : c.muted}
        style={{ textAlign: "center", maxWidth: 320 }}
      >
        {label}
      </Txt>
    </View>
  );
}

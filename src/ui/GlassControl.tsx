import React from "react";
import { View, Platform, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "./theme";
export function GlassControl({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { c, reduceTransparency, contrast } = useTheme();
  return Platform.OS === "ios" &&
    isLiquidGlassAvailable() &&
    !reduceTransparency &&
    !contrast ? (
    <GlassView
      glassEffectStyle="regular"
      isInteractive
      style={[{ borderRadius: 24 }, style]}
    >
      {children}
    </GlassView>
  ) : (
    <View style={[{ backgroundColor: c.surface, borderRadius: 24 }, style]}>
      {children}
    </View>
  );
}

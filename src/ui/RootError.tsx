import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useColorScheme,
} from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { capture } from "../services/telemetry";

export function RootError({ error, retry }: ErrorBoundaryProps) {
  const dark = useColorScheme() === "dark";
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    capture(error);
  }, [error]);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: dark ? "#101114" : "#F5F4EF",
        justifyContent: "center",
        padding: 32,
        gap: 20,
      }}
    >
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={{
          color: dark ? "#F5F4EF" : "#101114",
          fontSize: 26,
          fontWeight: "700",
        }}
      >
        RIVL couldn’t open this screen.
      </Text>
      <Text
        allowFontScaling
        style={{ color: dark ? "#F5F4EF" : "#101114", fontSize: 17 }}
      >
        Try opening it again. Workouts already saved on this device have not
        been deleted.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        style={{
          minHeight: 50,
          borderRadius: 14,
          backgroundColor: "#FF4B35",
          padding: 16,
          alignItems: "center",
        }}
        onPress={async () => {
          setBusy(true);
          try {
            await retry();
          } catch (next) {
            capture(next);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <ActivityIndicator color="#101114" />
        ) : (
          <Text
            allowFontScaling
            style={{ color: "#101114", fontSize: 17, fontWeight: "700" }}
          >
            Try again
          </Text>
        )}
      </Pressable>
    </View>
  );
}

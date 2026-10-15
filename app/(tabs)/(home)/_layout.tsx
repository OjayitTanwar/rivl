import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "../../../src/ui/theme";
export const unstable_settings = { initialRouteName: "index" };
export default function HomeLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        animation: "default",
      }}
    />
  );
}

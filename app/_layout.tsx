import { AutomaticRecorder } from "../src/state/AutomaticRecorder";
import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider } from "../src/state/store";
import { ThemeProvider, useTheme } from "../src/ui/theme";
import { FullScreenLoadingProvider } from "../src/ui/FullScreenLoading";
import "../src/services/recording";
import { initializeCrashReporting } from "../src/services/crash-reporting";
initializeCrashReporting();
/* Four global destinations; Health, Nutrition and Training open root sibling
   workspaces with their own bottom navigation and one visible tab bar. */
function Navigation() {
  const { c } = useTheme();
  return (
    <>
      <AutomaticRecorder />
      <StatusBar style={c.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: "default",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(health)" />
        <Stack.Screen name="(nutrition)" />
        <Stack.Screen name="(training)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
export { RootError as ErrorBoundary } from "../src/ui/RootError";
export default function Root() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ThemeProvider>
          <FullScreenLoadingProvider>
            <Navigation />
          </FullScreenLoadingProvider>
        </ThemeProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

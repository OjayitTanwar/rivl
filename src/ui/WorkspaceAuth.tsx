import React from "react";
import { Redirect } from "expo-router";
import { View } from "react-native";
import { useStore } from "../state/store";
import { LoadingJourney } from "./LoadingJourney";
import { Notice, Screen } from "./primitives";
import { useTheme } from "./theme";
/** Workspace groups are root siblings: their tab bars replace the global bar. */
export function WorkspaceAuth({ children }: { children: React.ReactNode }) {
  const { loading, session, profile, error, refresh } = useStore(),
    { c } = useTheme();
  // Preserve mounted tabs and editor state during authenticated refreshes.
  const hydrated = !!session && profile?.id === session.userId;
  if (loading && !hydrated)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.bg,
        }}
      >
        <LoadingJourney
          large
          fullScreen
          label="Getting your workspace ready…"
        />
      </View>
    );
  if (error && !hydrated)
    return (
      <Screen title="RIVL couldn’t load">
        <Notice text={error} retry={refresh} />
      </Screen>
    );
  if (!session) return <Redirect href="/auth" />;
  return <>{children}</>;
}

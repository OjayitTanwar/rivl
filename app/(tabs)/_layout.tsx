import React from "react";
import { Redirect } from "expo-router";
import { View } from "react-native";
import { useStore } from "../../src/state/store";
import { LoadingJourney } from "../../src/ui/LoadingJourney";
import Navigation from "../../src/ui/Navigation";
import { Notice, Screen } from "../../src/ui/primitives";
import { useTheme } from "../../src/ui/theme";
export default function Layout() {
  const { loading, session, error, refresh } = useStore(),
    { c } = useTheme();
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.bg,
        }}
      >
        <LoadingJourney large fullScreen label="Getting your training ready…" />
      </View>
    );
  if (error)
    return (
      <Screen title="RIVL couldn’t load">
        <Notice text={error} retry={refresh} />
      </Screen>
    );
  if (!session) return <Redirect href="/auth" />;
  return <Navigation />;
}

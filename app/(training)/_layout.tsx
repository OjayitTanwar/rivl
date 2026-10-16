import React from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { WorkspaceAuth } from "../../src/ui/WorkspaceAuth";
import { useTheme } from "../../src/ui/theme";
export const unstable_settings = { initialRouteName: "training" };
export default function Layout() {
  const { c } = useTheme();
  return (
    <WorkspaceAuth>
      <NativeTabs
        minimizeBehavior="never"
        tintColor={c.accent}
        backgroundColor={c.nav}
        labelStyle={{ fontSize: 11 }}
      >
        <NativeTabs.Trigger disableAutomaticContentInsets name="training">
          <NativeTabs.Trigger.Icon sf="figure.run" md="directions_run" />
          <NativeTabs.Trigger.Label>Plans</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          disableAutomaticContentInsets
          name="training-session"
        >
          <NativeTabs.Trigger.Icon sf="timer" md="timer" />
          <NativeTabs.Trigger.Label>Session</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          disableAutomaticContentInsets
          name="training-creators"
        >
          <NativeTabs.Trigger.Icon sf="person.2" md="groups" />
          <NativeTabs.Trigger.Label>Creators</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          disableAutomaticContentInsets
          name="training-history"
        >
          <NativeTabs.Trigger.Icon sf="clock" md="history" />
          <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </WorkspaceAuth>
  );
}

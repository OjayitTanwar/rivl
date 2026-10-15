import React from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { WorkspaceAuth } from "../../src/ui/WorkspaceAuth";
import { useTheme } from "../../src/ui/theme";
export const unstable_settings = { initialRouteName: "health-log" };
export default function Layout() {
  const { c } = useTheme();
  return (
    <WorkspaceAuth>
      <NativeTabs
        tintColor={c.accent}
        backgroundColor={c.nav}
        labelStyle={{ fontSize: 11 }}
      >
        <NativeTabs.Trigger disableAutomaticContentInsets name="health-log">
          <NativeTabs.Trigger.Icon sf="heart" md="favorite" />
          <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger disableAutomaticContentInsets name="sleep">
          <NativeTabs.Trigger.Icon sf="moon" md="bedtime" />
          <NativeTabs.Trigger.Label>Sleep</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger disableAutomaticContentInsets name="health-history">
          <NativeTabs.Trigger.Icon sf="clock" md="history" />
          <NativeTabs.Trigger.Label>Log</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          disableAutomaticContentInsets
          name="health-settings"
        >
          <NativeTabs.Trigger.Icon sf="link" md="link" />
          <NativeTabs.Trigger.Label>Connect</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </WorkspaceAuth>
  );
}

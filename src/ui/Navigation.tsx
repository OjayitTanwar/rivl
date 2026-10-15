import React from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "./theme";
export default function Navigation() {
  const { c } = useTheme();
  return (
    <NativeTabs
      tintColor={c.accent}
      backgroundColor={c.nav}
      labelStyle={{ fontSize: 11 }}
    >
      <NativeTabs.Trigger disableAutomaticContentInsets name="(home)">
        <NativeTabs.Trigger.Icon sf="house" md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger disableAutomaticContentInsets name="maps">
        <NativeTabs.Trigger.Icon sf="map" md="map" />
        <NativeTabs.Trigger.Label>Maps</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger disableAutomaticContentInsets name="record">
        <NativeTabs.Trigger.Icon sf="record.circle" md="radio_button_checked" />
        <NativeTabs.Trigger.Label>Record</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger disableAutomaticContentInsets name="community">
        <NativeTabs.Trigger.Icon sf="person.2" md="groups" />
        <NativeTabs.Trigger.Label>Groups</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

import React from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { WorkspaceAuth } from "../../src/ui/WorkspaceAuth";
import { useTheme } from "../../src/ui/theme";
export const unstable_settings = { initialRouteName: "nutrition" };
export default function Layout() {
  const { c } = useTheme();
  return (
    <WorkspaceAuth>
      <NativeTabs
        tintColor={c.accent}
        backgroundColor={c.nav}
        labelStyle={{ fontSize: 11 }}
      >
        <NativeTabs.Trigger disableAutomaticContentInsets name="nutrition">
          <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
          <NativeTabs.Trigger.Label>Diary</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger disableAutomaticContentInsets name="nutrition-plan">
          <NativeTabs.Trigger.Icon sf="calendar" md="calendar_today" />
          <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          disableAutomaticContentInsets
          name="nutrition-recipes"
        >
          <NativeTabs.Trigger.Icon sf="book" md="menu_book" />
          <NativeTabs.Trigger.Label>Recipes</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          disableAutomaticContentInsets
          name="nutrition-insights"
        >
          <NativeTabs.Trigger.Icon sf="chart.bar" md="bar_chart" />
          <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </WorkspaceAuth>
  );
}

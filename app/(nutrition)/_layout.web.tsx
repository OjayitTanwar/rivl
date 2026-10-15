import React from "react";
import {
  Utensils,
  Calendar,
  BookOpen,
  ChartNoAxesColumn,
} from "lucide-react-native";
import { Tabs } from "expo-router";
import { WorkspaceAuth } from "../../src/ui/WorkspaceAuth";
import { useTheme } from "../../src/ui/theme";
export default function Layout() {
  const { c } = useTheme();
  return (
    <WorkspaceAuth>
      <Tabs
        initialRouteName="nutrition"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.muted,
          tabBarStyle: { backgroundColor: c.nav, borderTopColor: c.line },
        }}
      >
        <Tabs.Screen
          name="nutrition"
          options={{
            title: "Diary",
            tabBarIcon: ({ color, size }) => (
              <Utensils color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="nutrition-plan"
          options={{
            title: "Plan",
            tabBarIcon: ({ color, size }) => (
              <Calendar color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="nutrition-recipes"
          options={{
            title: "Recipes",
            tabBarIcon: ({ color, size }) => (
              <BookOpen color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="nutrition-insights"
          options={{
            title: "Insights",
            tabBarIcon: ({ color, size }) => (
              <ChartNoAxesColumn color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </WorkspaceAuth>
  );
}

import React from "react";
import { Footprints, Timer, Users, Clock } from "lucide-react-native";
import { Tabs } from "expo-router";
import { WorkspaceAuth } from "../../src/ui/WorkspaceAuth";
import { useTheme } from "../../src/ui/theme";
export default function Layout() {
  const { c } = useTheme();
  return (
    <WorkspaceAuth>
      <Tabs
        initialRouteName="training"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.muted,
          tabBarStyle: { backgroundColor: c.nav, borderTopColor: c.line },
        }}
      >
        <Tabs.Screen
          name="training"
          options={{
            title: "Plans",
            tabBarIcon: ({ color, size }) => (
              <Footprints color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="training-session"
          options={{
            title: "Session",
            tabBarIcon: ({ color, size }) => (
              <Timer color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="training-creators"
          options={{
            title: "Creators",
            tabBarIcon: ({ color, size }) => (
              <Users color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="training-history"
          options={{
            title: "History",
            tabBarIcon: ({ color, size }) => (
              <Clock color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </WorkspaceAuth>
  );
}

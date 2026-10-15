import React from "react";
import { Heart, Moon, Clock, Link } from "lucide-react-native";
import { Tabs } from "expo-router";
import { WorkspaceAuth } from "../../src/ui/WorkspaceAuth";
import { useTheme } from "../../src/ui/theme";
export default function Layout() {
  const { c } = useTheme();
  return (
    <WorkspaceAuth>
      <Tabs
        initialRouteName="health-log"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.muted,
          tabBarStyle: { backgroundColor: c.nav, borderTopColor: c.line },
        }}
      >
        <Tabs.Screen
          name="health-log"
          options={{
            title: "Overview",
            tabBarIcon: ({ color, size }) => (
              <Heart color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="sleep"
          options={{
            title: "Sleep",
            tabBarIcon: ({ color, size }) => <Moon color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="health-history"
          options={{
            title: "Log",
            tabBarIcon: ({ color, size }) => (
              <Clock color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="health-settings"
          options={{
            title: "Connect",
            tabBarIcon: ({ color, size }) => <Link color={color} size={size} />,
          }}
        />
      </Tabs>
    </WorkspaceAuth>
  );
}

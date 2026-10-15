import React from "react";
import { router } from "expo-router";
import {
  Activity,
  Heart,
  Utensils,
  Dumbbell,
  UserRound,
  Bell,
} from "lucide-react-native";
import {
  Screen,
  Stack,
  Row,
  Txt,
  ListRow,
  IconButton,
  Notice,
} from "../../../src/ui/primitives";
import { useTheme } from "../../../src/ui/theme";
import { useStore } from "../../../src/state/store";

/** One home, shared navigation and identity; workspaces use the native stack. */
export default function Home() {
  const { c } = useTheme();
  const { profile, online } = useStore();
  const spaces = [
    {
      title: "Activity",
      detail: "Your workouts, routes and progress",
      route: "/activity-space",
      Icon: Activity,
    },
    {
      title: "Health",
      detail: "Steps, sleep, heart rate and daily health",
      route: "/health-log",
      Icon: Heart,
    },
    {
      title: "Nutrition",
      detail: "Meals, food lookup and daily nutrition",
      route: "/nutrition",
      Icon: Utensils,
    },
    {
      title: "Guided training",
      detail: "Choose a session and follow each interval",
      route: "/training",
      Icon: Dumbbell,
    },
  ] as const;
  return (
    <Screen
      title="Home"
      contentStyle={{ gap: 24 }}
      action={
        <Row style={{ gap: 8 }}>
          <IconButton
            label="Notifications"
            onPress={() => router.push("/notifications")}
          >
            <Bell size={22} color={c.text} />
          </IconButton>
          <IconButton label="Your profile" onPress={() => router.push("/you")}>
            <UserRound size={22} color={c.text} />
          </IconButton>
        </Row>
      }
    >
      {!online && (
        <Notice text="You’re offline. Saved workouts, health records and meals remain available." />
      )}
      <Stack gap={8}>
        <Txt size="title" weight="700">
          Your day, together.
        </Txt>
        <Txt color={c.muted}>
          One place for your activity, health, food and training.
        </Txt>
      </Stack>
      <Stack gap={0}>
        {spaces.map(({ title, detail, route, Icon }) => (
          <ListRow
            key={title}
            title={title}
            detail={detail}
            icon={<Icon size={24} color={c.accent} />}
            onPress={() => router.push(route)}
          />
        ))}
      </Stack>
      <ListRow
        title="You & settings"
        detail={profile?.name ?? "Your profile and preferences"}
        icon={<UserRound size={22} color={c.text} />}
        onPress={() => router.push("/you")}
      />
    </Screen>
  );
}

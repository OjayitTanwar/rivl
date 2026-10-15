import React from "react";
import { router } from "expo-router";
import { Screen, Empty, Button, Card, Txt, Stack } from "../src/ui/primitives";
import { useStore } from "../src/state/store";
import { records } from "../src/domain/analytics";
export default function Notifications() {
  const { activities } = useStore(),
    recent = records(activities).filter(
      (r) => Date.now() - r.activity.startedAt < 7 * 86400000,
    );
  return (
    <Screen title="Notifications" back>
      {recent.length ? (
        recent.map((r) => (
          <Card key={r.distance}>
            <Txt weight="700">A benchmark worth remembering</Txt>
            <Txt>
              {r.distance / 1000} km · {r.activity.title}
            </Txt>
            <Button
              title="See your effort"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/activity/[id]",
                  params: { id: r.activity.id },
                })
              }
            />
          </Card>
        ))
      ) : (
        <Empty
          title="All caught up."
          body="Your recent personal bests will appear here. Training reminders can be configured in Settings."
        />
      )}
      <Button
        title="Manage reminders"
        variant="secondary"
        onPress={() => router.push("/settings")}
      />
    </Screen>
  );
}

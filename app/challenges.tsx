import React from "react";
import { router } from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Card,
  Txt,
  Row,
  Metric,
  Button,
  Empty,
  Pill,
  Stack,
  SectionHeading,
} from "../src/ui/primitives";
import { ProgressBar } from "../src/ui/charts";
import { challengeProgress } from "../src/domain/analytics";
import { km } from "../src/domain/format";
export default function Challenges() {
  const { challenges, activities, join } = useStore();
  return (
    <Screen title="Challenges" back>
      <Stack gap={8}>
        <SectionHeading title="A goal to share" />
        <Txt>Join a community challenge and build progress through your recorded activities.</Txt>
      </Stack>
      {challenges.map((c) => {
        const progress = challengeProgress(c, activities),
          unit =
            c.kind === "distance" ? "km" : c.kind === "ascent" ? "m" : "days",
          value =
            c.kind === "distance"
              ? km(progress, 0)
              : String(Math.round(progress)),
          target = c.kind === "distance" ? km(c.target, 0) : String(c.target);
        return (
          <Card key={c.id}>
            <Txt size="heading" weight="700">
              {c.title}
            </Txt>
            <Metric value={value} unit={unit} label={`of ${target} ${unit}`} />
            <ProgressBar value={progress / c.target} />
            <Txt size="caption">{new Date(c.start).toLocaleDateString()} – {new Date(c.end).toLocaleDateString()}</Txt>
            <Button
              title={c.joined ? "Leave challenge" : "Join challenge"}
              variant={c.joined ? "secondary" : "primary"}
              onPress={() => join(c)}
            />
          </Card>
        );
      })}
      {!challenges.length && (
        <Empty
          title="Set your own pace"
          body="There are no community challenges to join yet. Keep building toward your own weekly distance goal in the meantime."
          action={<Button title="Set a weekly goal" variant="secondary" onPress={() => router.push("/settings")} />}
        />
      )}
    </Screen>
  );
}

import React from "react";
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
} from "../src/ui/primitives";
import { ProgressBar } from "../src/ui/charts";
import { challengeProgress } from "../src/domain/analytics";
import { km } from "../src/domain/format";
export default function Challenges() {
  const { challenges, activities, join } = useStore();
  return (
    <Screen title="Challenges" back>
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
            <Pill>
              {new Date(c.end)
                .toLocaleDateString(undefined, { month: "long" })
                .toUpperCase()}{" "}
              CHALLENGE
            </Pill>
            <Txt size="heading" weight="700">
              {c.title}
            </Txt>
            <Metric value={value} unit={unit} label={`of ${target} ${unit}`} />
            <ProgressBar value={progress / c.target} />
            <Txt>Progress comes from your recorded activities this month.</Txt>
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
          title="Set your own pace."
          body="Community challenges will appear when your club publishes them. Your weekly distance goal is always available in Settings."
        />
      )}
    </Screen>
  );
}

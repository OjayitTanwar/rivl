import React from "react";
import { useStore } from "../src/state/store";
import {
  Screen,
  Card,
  Txt,
  Row,
  Pill,
  Empty,
  Button,
  Stack,
  SectionHeading,
} from "../src/ui/primitives";
import { rankEfforts } from "../src/domain/competition";
import { router } from "expo-router";
export default function Leagues() {
  const { efforts, session } = useStore(),
    ranked = rankEfforts(efforts, "improved");
  return (
    <Screen title="Leagues" back>
      <Stack gap={8}>
        <SectionHeading title="Progress with your people" />
        <Txt>Compare improvement across recorded segment efforts.</Txt>
      </Stack>
      {ranked.length ? (
        <Card>
          <Txt size="heading" weight="700">
            The Better Every Week League
          </Txt>
          <Txt>
            Standings use improvement against your previous effort. Everyone
            brings their own starting line.
          </Txt>
          {ranked.map((e, i) => (
            <Row key={e.id} between style={{ paddingVertical: 12 }}>
              <Txt>
                {i + 1}. {e.athlete}
              </Txt>
              <Txt mono weight="700">
                {e.previous
                  ? `${((1 - e.seconds / e.previous) * 100).toFixed(1)}%`
                  : "First effort"}
              </Txt>
            </Row>
          ))}
        </Card>
      ) : (
        <Empty
          title="Your first standings are ahead"
          body="Standings appear when segment efforts are available. Connect with athletes and clubs to build your community."
        />
      )}
      <Button
        title="Explore people & clubs"
        variant="secondary"
        onPress={() => router.push("/people")}
      />
    </Screen>
  );
}

import { userMessage } from "../src/security/errors";
import React, { useEffect, useState } from "react";
import { useStore } from "../src/state/store";
import {
  Screen,
  Card,
  Txt,
  Row,
  Button,
  Field,
  Stack,
  Empty,
  Notice,
  SectionHeading,
  Pill,
} from "../src/ui/primitives";
import {
  people,
  follow,
  clubs,
  joinClub,
  type Person,
  type Club,
} from "../src/services/social";
import { useTheme } from "../src/ui/theme";
export default function People() {
  const { session } = useStore(),
    { c } = useTheme(),
    [q, setQ] = useState(""),
    [athletes, setAthletes] = useState<Person[]>([]),
    [groups, setGroups] = useState<Club[]>([]),
    [error, setError] = useState("");
  async function load() {
    if (!session) return;
    try {
      const [p, c] = await Promise.all([people(session, q), clubs(session)]);
      setAthletes(p);
      setGroups(c);
    } catch (e) {
      setError(userMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, [session?.userId, q]);
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(userMessage(e));
    }
  }
  return (
    <Screen title="People & clubs" back>
      {!!error && <Notice text={error} retry={() => void load()} />}
      <Field
        label="Search athletes"
        value={q}
        onChangeText={setQ}
        placeholder="An athlete’s name"
      />
      <Stack>
        <SectionHeading title="Athletes" />
        {athletes.map((p) => (
          <Card key={p.id}>
            <Row between>
              <Stack gap={4} style={{ flex: 1 }}>
                <Txt weight="700">{p.name}</Txt>
                <Txt size="caption" color={c.muted}>
                  @{p.handle}
                </Txt>
              </Stack>
              <Button
                title={
                  p.friendship === "received"
                    ? "Accept request"
                    : p.friendship === "accepted"
                      ? "Remove friend"
                      : p.following
                        ? "Cancel request"
                        : "Add friend"
                }
                variant="secondary"
                onPress={() => act(() => follow(session!, p))}
              />
            </Row>
          </Card>
        ))}
        {!athletes.length && (
          <Empty
            title="No matches yet"
            body="Try another name. Your connected community will appear here."
          />
        )}
      </Stack>
      <Stack>
        <SectionHeading title="Clubs" />
        {groups.map((g) => (
          <Card key={g.id}>
            <Txt size="heading" weight="700">
              {g.name}
            </Txt>
            <Txt color={c.muted}>{g.description}</Txt>
            <Button
              title={g.joined ? "Leave club" : "Join club"}
              variant={g.joined ? "secondary" : "primary"}
              onPress={() => act(() => joinClub(session!, g))}
            />
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}

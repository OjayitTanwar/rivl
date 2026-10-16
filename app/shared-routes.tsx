import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Stack,
  Row,
  Button,
  Choice,
  Notice,
  Empty,
  SectionHeading,
  ListRow,
} from "../src/ui/primitives";
import { Trace } from "../src/ui/charts";
import { useTheme } from "../src/ui/theme";
import { km } from "../src/domain/format";
import { sharedRouteCopy, type SharedRoute } from "../src/domain/shared-routes";
import {
  listSharedRoutes,
  publishSharedRoute,
  unpublishSharedRoute,
  reportSharedRoute,
} from "../src/services/shared-routes";
import {
  assertCurrentCloudUser,
  routeRepository,
} from "../src/services/routes";
import { userMessage } from "../src/security/errors";
import type { Sport } from "../src/domain/types";
export default function SharedRoutes() {
  const { session, profile, routes, saveRoute } = useStore(),
    { c } = useTheme();
  const owner = profile?.id;
  const cloud = !!owner && !session?.local;
  const [sport, setSport] = useState("all"),
    [items, setItems] = useState<SharedRoute[]>([]),
    [loading, setLoading] = useState(false),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(""),
    [publishOpen, setPublishOpen] = useState(false),
    [saved, setSaved] = useState<string[]>([]),
    [revision, setRevision] = useState(0);
  const actionLock = useRef(false);
  const generation = useRef(0),
    currentOwner = useRef(owner);
  currentOwner.current = owner;
  const load = useCallback(
    async (append = false) => {
      if (!cloud || !owner) return;
      const gen = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const rows = await listSharedRoutes(
          owner,
          sport === "all" ? undefined : (sport as Sport),
          append ? items.at(-1) : undefined,
        );
        if (gen !== generation.current || currentOwner.current !== owner)
          return;
        setItems((old) =>
          append
            ? [...old, ...rows.filter((r) => !old.some((x) => x.id === r.id))]
            : rows,
        );
        setMore(rows.length === 20);
      } catch (e) {
        if (gen === generation.current) setError(userMessage(e));
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [cloud, owner, sport, items],
  );
  useEffect(() => {
    setItems([]);
    setPending("");
    setPublishOpen(false);
    setMore(false);
    void load();
    return () => {
      generation.current++;
    };
  }, [owner, cloud, sport, revision]);
  useEffect(() => {
    setSaved([]);
  }, [owner]);
  async function action(id: string, work: () => Promise<void>) {
    if (actionLock.current || !owner) return;
    actionLock.current = true;
    setPending(id);
    setError("");
    try {
      await work();
      if (currentOwner.current === owner) setRevision((v) => v + 1);
    } catch (e) {
      if (currentOwner.current === owner) setError(userMessage(e));
    } finally {
      actionLock.current = false;
      if (currentOwner.current === owner) setPending("");
    }
  }
  return (
    <Screen title="Shared routes" back>
      <Choice
        label="Sport"
        value={sport}
        onChange={setSport}
        options={[
          { label: "All", value: "all" },
          { label: "Ride", value: "ride" },
          { label: "Run", value: "run" },
          { label: "Walk", value: "walk" },
          { label: "Hike", value: "hike" },
        ]}
      />
      {!cloud ? (
        <Empty
          title="Sign in to share routes"
          body="Your personal routes stay on this device."
        />
      ) : (
        <>
          <Button
            title={publishOpen ? "Close publishing" : "Publish a route"}
            variant="secondary"
            onPress={() => setPublishOpen(!publishOpen)}
          />
          {publishOpen && (
            <Stack gap={12}>
              <Txt size="caption" color={c.muted}>
                Public under CC BY 4.0. The first and last 200 m are hidden.
                Choose a route you have permission to share.
              </Txt>
              {routes
                .filter((r) => r.routing !== "manual")
                .map((r) => (
                  <ListRow
                    key={r.id}
                    title={r.name}
                    detail={`${km(r.distance)} km`}
                    onPress={() =>
                      void action(r.id, async () => {
                        await routeRepository.sync(owner!);
                        await publishSharedRoute(owner!, r.id);
                        setPublishOpen(false);
                      })
                    }
                  />
                ))}
              {!routes.some((r) => r.routing !== "manual") && (
                <Txt size="caption" color={c.muted}>
                  Save a route first.
                </Txt>
              )}
            </Stack>
          )}
          {!!error && <Notice text={error} retry={() => void load()} />}
          <SectionHeading title="Explore" />
          {loading && (
            <Txt size="caption" color={c.muted}>
              Loading routes…
            </Txt>
          )}
          {!loading && !error && !items.length && (
            <Empty
              title="No shared routes yet"
              body="Published routes will appear here."
            />
          )}
          {items.slice(0, 200).map((r) => (
            <Stack
              key={r.id}
              gap={12}
              style={{
                paddingVertical: 20,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <Row>
                <View
                  style={{
                    backgroundColor: c.soft,
                    borderRadius: 8,
                    padding: 4,
                  }}
                >
                  <Trace
                    points={r.points.map((p) => ({
                      ...p,
                      t: 0,
                      accuracy: 0,
                      segment: 0,
                    }))}
                    size={76}
                  />
                </View>
                <Stack style={{ flex: 1 }} gap={4}>
                  <Txt size="subheading" weight="700">
                    {r.title}
                  </Txt>
                  <Txt size="caption" color={c.muted}>
                    {r.creator} · {r.sport}
                  </Txt>
                  <Txt mono>{km(r.distance)} km</Txt>
                </Stack>
              </Row>
              <Txt size="caption" color={c.muted}>
                {r.license} · Community route, access conditions may change.
              </Txt>
              <Button
                title={
                  saved.includes(r.id) ? "Saved to your routes" : "Save route"
                }
                disabled={saved.includes(r.id) || !!pending}
                loading={pending === r.id}
                onPress={() =>
                  void action(r.id, async () => {
                    await assertCurrentCloudUser(owner!);
                    await saveRoute(sharedRouteCopy(r, Crypto.randomUUID()));
                    if (currentOwner.current === owner)
                      setSaved((v) => [...v, r.id]);
                  })
                }
              />
              {r.ownerId === owner ? (
                <Button
                  title="Unpublish"
                  variant="quiet"
                  disabled={!!pending}
                  onPress={() =>
                    void action(r.id, () => unpublishSharedRoute(owner!, r.id))
                  }
                />
              ) : (
                <Row>
                  <Button
                    title="Report unsafe route"
                    variant="quiet"
                    disabled={!!pending}
                    onPress={() =>
                      void action(r.id, () =>
                        reportSharedRoute(owner!, r.id, "unsafe"),
                      )
                    }
                  />
                  <Button
                    title="Block creator"
                    variant="quiet"
                    disabled={!!pending}
                    onPress={() =>
                      void action(r.id, async () => {
                        const { setBlocked } =
                          await import("../src/services/safety");
                        await setBlocked(session!, r.ownerId, true);
                      })
                    }
                  />
                </Row>
              )}
            </Stack>
          ))}
          {more && items.length < 200 && (
            <Button
              title="Load more"
              variant="secondary"
              loading={loading}
              onPress={() => void load(true)}
            />
          )}
        </>
      )}
    </Screen>
  );
}

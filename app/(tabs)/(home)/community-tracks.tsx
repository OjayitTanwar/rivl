import React, { useCallback, useRef, useState } from "react";
import { Alert, Platform, Switch } from "react-native";
import { useFocusEffect } from "expo-router";
import { useStore } from "../../../src/state/store";
import { database } from "../../../src/storage/database";
import {
  CommunityTrackRepository,
  type TrackContributionDraft,
  type TrackMappingSettings,
} from "../../../src/services/community-track-repository";
import {
  nearbyObservedTracks,
  type ObservedTrackCell,
} from "../../../src/services/community-track-sync";
import { plannerLocation } from "../../../src/services/route-location";
import type { Coordinate } from "../../../src/domain/types";
import {
  Screen,
  Stack,
  Txt,
  Row,
  Button,
  ListRow,
  Notice,
} from "../../../src/ui/primitives";
import { SettingsSection } from "../../../src/ui/SettingsSection";
import { useTheme } from "../../../src/ui/theme";
import RouteMap from "../../../src/ui/RouteMap";
import { userMessage } from "../../../src/security/errors";
const repository = new CommunityTrackRepository(database);
export default function CommunityTracks() {
  const { profile, session, sync, trackMappingError } = useStore(),
    { c } = useTheme();
  const owner = profile?.id;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    settings: TrackMappingSettings;
    drafts: TrackContributionDraft[];
  } | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    generation = useRef(0);
  const [area, setArea] = useState<Coordinate>(),
    [cells, setCells] = useState<ObservedTrackCell[]>([]),
    [loaded, setLoaded] = useState(false);
  useFocusEffect(
    useCallback(() => {
      const version = ++generation.current;
      setError("");
      setSnapshot(null);
      setCells([]);
      setLoaded(false);
      setArea(undefined);
      if (owner)
        Promise.all([repository.settings(owner), repository.list(owner)])
          .then(([settings, drafts]) => {
            if (version === generation.current && ownerRef.current === owner)
              setSnapshot({ owner, settings, drafts });
          })
          .catch((e) => {
            if (version === generation.current) setError(userMessage(e));
          });
      return () => {
        generation.current++;
      };
    }, [owner]),
  );
  const data = snapshot?.owner === owner ? snapshot : null;
  async function act(work: (id: string) => Promise<void>) {
    if (!owner || !data || lock.current) return;
    const id = owner,
      version = generation.current;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      await work(id);
      const [settings, drafts] = await Promise.all([
        repository.settings(id),
        repository.list(id),
      ]);
      if (ownerRef.current === id && version === generation.current)
        setSnapshot({ owner: id, settings, drafts });
    } catch (e) {
      if (ownerRef.current === id && version === generation.current)
        setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id) setPending(false);
    }
  }
  const removePrevious = () => {
    const remove = () =>
      void act(async (id) => {
        await repository.deletePrevious(id);
        await sync(true);
        setCells([]);
        setLoaded(false);
      });
    if (Platform.OS === "web") {
      if (globalThis.confirm("Remove your previous mapping contributions?"))
        remove();
    } else
      Alert.alert(
        "Remove previous contributions?",
        "Future eligible workouts can still contribute while automatic mapping is on.",
        [
          { text: "Keep contributions", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: remove },
        ],
      );
  };
  return (
    <Screen title="Community tracks" back contentStyle={{ paddingBottom: 120 }}>
      <Txt color={c.muted}>
        Help reveal where people run, ride, walk and hike. New eligible
        recordings contribute automatically.
      </Txt>
      {!!error && <Notice text={error} />}
      {!error && !!trackMappingError && <Notice text={trackMappingError} />}
      <SettingsSection title="Your contributions">
        <Row between>
          <Stack gap={4} style={{ flex: 1 }}>
            <Txt weight="600">Automatic mapping</Txt>
            <Txt size="caption" color={c.muted}>
              Applies to new GPS and Watch workouts
            </Txt>
          </Stack>
          <Switch
            accessibilityLabel="Automatic community mapping"
            value={data?.settings.enabled ?? false}
            disabled={!data || pending}
            trackColor={{ true: c.accent, false: c.line }}
            onValueChange={(enabled) =>
              void act(async (id) => {
                await repository.setEnabled(id, enabled);
                await sync(true);
              })
            }
          />
        </Row>
        <Txt size="caption" color={c.muted}>
          Imports, manual entries and simulated workouts do not contribute.
          Short or inaccurate GPS fragments are skipped. Turning this off stops
          new contributions here. Shared evidence is hidden once the change
          syncs; you can also remove previous contributions below.
        </Txt>
        <Txt color={c.muted}>
          {session?.local
            ? "Contributions stay queued on this device until cloud sharing is connected."
            : "Contributions upload after the original workout syncs."}
        </Txt>
        {data && (
          <Txt>
            {data.drafts.filter((d) => d.state === "pending").length} pending ·{" "}
            {data.drafts.filter((d) => d.state === "submitted").length}{" "}
            submitted
          </Txt>
        )}
        {data &&
          data.settings.deleteGeneration >
            data.settings.syncedDeleteGeneration && (
            <Txt size="caption" color={c.muted}>
              Removal is waiting to sync.
            </Txt>
          )}
        {data?.drafts.slice(0, 10).map((d) => (
          <ListRow
            key={d.activityId}
            title={new Date(d.updatedAt).toLocaleDateString()}
            detail={
              d.state === "submitted"
                ? "Submitted · awaiting corroboration"
                : d.state === "withdraw"
                  ? "Removal pending"
                  : d.attempts
                    ? "Waiting to retry"
                    : "Queued on this device"
            }
          />
        ))}
        <Button
          title="Sync contributions"
          variant="secondary"
          loading={pending}
          disabled={!data || !!session?.local}
          onPress={() =>
            void act(async () => {
              await sync(true);
            })
          }
        />
        <Button
          title="Remove previous contributions"
          variant="quiet"
          disabled={!data || pending}
          onPress={removePrevious}
        />
      </SettingsSection>
      <SettingsSection title="Observed areas">
        <Txt color={c.muted}>
          Shared areas appear only after repeated evidence from at least five
          athletes across three days. They indicate observed use, not a
          dedicated path, legal access or safety.
        </Txt>
        <Button
          title="Check nearby areas"
          variant="secondary"
          disabled={!data || !!session?.local}
          loading={pending}
          onPress={() =>
            void act(async (id) => {
              const version = generation.current;
              const center = await plannerLocation();
              const result = await nearbyObservedTracks(center.lat, center.lng);
              if (ownerRef.current === id && generation.current === version) {
                setArea(center);
                setCells(result);
                setLoaded(true);
              }
            })
          }
        />
        {area && (
          <RouteMap
            points={[]}
            center={area}
            localFocus
            allowMapboxFallback
            autoFit={false}
            height={280}
            /* Constant display weight denotes presence, not a visit count. */
            cells={cells.map((cell) => ({
              lat: cell.lat,
              lng: cell.lng,
              visits: 1,
            }))}
          />
        )}
        {loaded && (
          <Txt color={c.muted}>
            {cells.length
              ? `${cells.length} corroborated areas nearby`
              : "No corroborated areas nearby yet."}
          </Txt>
        )}
      </SettingsSection>
    </Screen>
  );
}

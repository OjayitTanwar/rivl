import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useStore } from "../src/state/store";
import { Screen, Txt, Button, Notice, Choice } from "../src/ui/primitives";
import { SettingsSection } from "../src/ui/SettingsSection";
import { LoadingJourney } from "../src/ui/LoadingJourney";
import { watchBridge, connectWatch } from "../src/services/watch";
import { decodeWatchWorkout } from "../src/domain/watch-workout";
import { prepareTrackEvidence } from "../src/domain/community-tracks";
import { CommunityTrackRepository } from "../src/services/community-track-repository";
import { database } from "../src/storage/database";
import { userMessage } from "../src/security/errors";
export default function Watch() {
  const { profile, routes, saveActivity, activities } = useStore(),
    [status, setStatus] = useState("Checking your watch…"),
    [busy, setBusy] = useState(false),
    [availability, setAvailability] = useState({
      supported: false,
      paired: false,
      installed: false,
      reachable: false,
    }),
    [waitingImports, setWaitingImports] = useState(0),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState("");
  async function check() {
    if (!watchBridge) {
      setStatus(
        Platform.OS === "ios"
          ? "Watch connection is unavailable. Update RIVL and try again."
          : "Apple Watch works with the iPhone app.",
      );
      return;
    }
    const result = await watchBridge.status();
    setAvailability(result);
    if (profile)
      setWaitingImports((await watchBridge.inbox(profile.id)).length);
    setStatus(
      !result.supported
        ? "Watch connection is unavailable on this device."
        : !result.paired
          ? "No Apple Watch paired to this iPhone."
          : !result.installed
            ? "Install RIVL on your watch in the iPhone Watch app."
            : result.reachable
              ? "Your watch is connected."
              : "Watch paired. Workouts transfer when it reconnects.",
    );
  }
  useEffect(() => {
    void check().catch((e) => setMessage(userMessage(e)));
  }, [profile?.id]);
  const prepared =
    availability.supported && availability.paired && availability.installed;
  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await task();
      await check();
    } catch (e) {
      setMessage(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title="Apple Watch" back>
      <SettingsSection title="Connection">
        {status === "Checking your watch…" ? (
          <LoadingJourney compact label={status} />
        ) : (
          <Txt>{status}</Txt>
        )}
        <Txt>
          Record a run, ride, walk or hike with GPS, measured heart rate, pause
          and lap controls. Workouts stay on your watch until the phone confirms
          they were imported.
        </Txt>
        <Button
          title="Connect this athlete to watch"
          loading={busy}
          disabled={!profile || !watchBridge || !prepared}
          onPress={() =>
            void act(async () => {
              await connectWatch(profile!);
              setMessage(
                "Athlete sent to your watch. Open RIVL on the watch to record.",
              );
            })
          }
        />
      </SettingsSection>
      {!prepared && (
        <SettingsSection title="Set up your watch">
          <Txt>
            Pair your Apple Watch using the iPhone Watch app, then install RIVL
            on it. Return here to connect your athlete.
          </Txt>
          <Button
            title="Check watch connection"
            variant="secondary"
            loading={busy}
            onPress={() => void act(check)}
          />
        </SettingsSection>
      )}
      {!!message && <Notice text={message} />}
      <SettingsSection title="Import completed watch workouts">
        <Txt>
          Open this screen after finishing on the watch. Transfers can arrive
          while your phone is offline. Imports are private and bound to this
          athlete.
        </Txt>
        {!prepared && (
          <Txt>
            {waitingImports
              ? `${waitingImports} received workout${waitingImports === 1 ? "" : "s"} ready to import.`
              : "Import becomes available once RIVL is installed on your paired watch. Previously received workouts can still be imported."}
          </Txt>
        )}
        <Button
          title="Check & import watch workouts"
          loading={busy}
          disabled={!watchBridge || !profile || (!prepared && !waitingImports)}
          onPress={() =>
            void act(async () => {
              if (prepared) await connectWatch(profile!);
              const inbox = await watchBridge!.inbox(profile!.id);
              let count = 0;
              for (const body of inbox) {
                const { activity, points } = decodeWatchWorkout(
                  JSON.parse(body),
                  profile!,
                );
                const key = `watch-import:${profile!.id}:${activity.id}`;
                if (!(await database.get(key))) {
                  if (!activities.some((a) => a.id === activity.id)) {
                    const prepared = prepareTrackEvidence(
                      activity,
                      points,
                      profile!.id,
                      "watch-gps",
                      profile!.privacyZones,
                    );
                    const contribution = prepared.evidence
                      ? await new CommunityTrackRepository(
                          database,
                        ).prepareForCommit(profile!.id, prepared.evidence)
                      : {};
                    await database.commitSamples(
                      activity.id,
                      points,
                      contribution,
                    );
                    await saveActivity(activity);
                  }
                  await database.set(key, true);
                }
                await watchBridge!.acknowledge(profile!.id, activity.id);
                count++;
              }
              setMessage(
                count
                  ? `Imported ${count} watch workout${count === 1 ? "" : "s"}.`
                  : "No completed workouts have arrived yet. Tap Send saved workouts on your watch and check again.",
              );
            })
          }
        />
      </SettingsSection>
      {routes.length > 0 && (
        <SettingsSection title="Route on watch">
          <Choice
            label="Route"
            options={routes.map((r) => ({ label: r.name, value: r.id }))}
            value={selected || routes[0]!.id}
            onChange={setSelected}
          />
          <Button
            title="Send route to watch"
            loading={busy}
            disabled={!profile || !watchBridge || !prepared}
            onPress={() =>
              void act(async () => {
                await connectWatch(
                  profile!,
                  routes.find((r) => r.id === (selected || routes[0]?.id)),
                );
                setMessage("Route preview sent to the watch.");
              })
            }
          />
          <Txt>
            The watch shows a route preview. Spoken turn-by-turn guidance is
            available on the phone.
          </Txt>
        </SettingsSection>
      )}
      <Txt size="caption">
        Allow location and Health access on your watch to record outdoor
        workouts and heart rate. Keep saved workouts until they appear here.
      </Txt>
    </Screen>
  );
}

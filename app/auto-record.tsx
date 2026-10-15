import React, { useEffect, useRef, useState } from "react";
import { motionBridge } from "../src/services/motion";
import { Switch, Platform, View, Linking } from "react-native";
import { router } from "expo-router";
import { PlayCircle, Settings2 } from "lucide-react-native";
import * as Location from "expo-location";
import { useStore } from "../src/state/store";
import {
  Screen,
  Stack,
  Row,
  Txt,
  Segmented,
  Notice,
  Button,
  ListRow,
  SectionHeading,
} from "../src/ui/primitives";
import {
  autoRecordPreferences,
  saveAutoRecordPreferences,
  type AutoRecordPreferences,
} from "../src/services/auto-record-preferences";
import { userMessage } from "../src/security/errors";
import { LoadingJourney } from "../src/ui/LoadingJourney";
import { useTheme } from "../src/ui/theme";
export default function AutoRecord() {
  const { profile } = useStore();
  const { c } = useTheme();
  const [prefs, setPrefs] = useState<AutoRecordPreferences>({
    enabled: false,
    sport: "run",
  });
  const [owner, setOwner] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const currentOwner = useRef(profile?.id);
  currentOwner.current = profile?.id;
  useEffect(() => {
    let alive = true;
    setError("");
    if (profile)
      void autoRecordPreferences(profile.id)
        .then((p) => {
          if (alive) {
            setPrefs(p);
            setOwner(profile.id);
          }
        })
        .catch((e) => {
          if (alive) setError(userMessage(e));
        });
    return () => {
      alive = false;
    };
  }, [profile?.id]);
  const save = async (next: AutoRecordPreferences) => {
    if (!profile || owner !== profile.id || busy) return;
    const requestOwner = profile.id;
    setBusy(true);
    setError("");
    try {
      if (next.enabled) {
        if (Platform.OS === "ios") {
          if (!motionBridge) {
            setError(
              "Install the updated RIVL build to enable automatic start. Manual recording is available.",
            );
            return;
          }
          const motionGranted = await motionBridge.requestPermission();
          if (currentOwner.current !== requestOwner) return;
          if (!motionGranted) {
            setError(
              "Automatic start needs Motion & Fitness access. On a supported iPhone, allow RIVL in Settings.",
            );
            return;
          }
        }
        const permission = await Location.requestForegroundPermissionsAsync();
        if (currentOwner.current !== requestOwner) return;
        if (!permission.granted || permission.ios?.accuracy === "reduced") {
          setError(
            "Allow Precise Location in Settings to enable automatic starts.",
          );
          return;
        }
      }
      await saveAutoRecordPreferences(profile.id, next);
      if (currentOwner.current === requestOwner) setPrefs(next);
    } catch (e) {
      if (currentOwner.current === requestOwner) setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const loaded = !!profile && owner === profile.id;
  const sportName = prefs.sport[0]!.toUpperCase() + prefs.sport.slice(1);
  return (
    <Screen title="Automatic start" back contentStyle={{ gap: 28 }}>
      <Stack gap={8}>
        <Txt size="heading" weight="700">
          Start when you move
        </Txt>
        <Txt color={c.muted}>
          After 90 seconds of continuous movement, RIVL can start an activity
          while the app is open.
        </Txt>
        <Txt size="caption" color={c.muted}>
          Off by default. You choose when to enable it.
        </Txt>
      </Stack>
      {!!error && <Notice text={error} />}
      {!profile && <Notice text="Sign in to manage automatic start." />}
      {profile && !loaded && !error && (
        <LoadingJourney
          fullScreen
          compact
          label="Loading your recording preference…"
        />
      )}
      <Row
        between
        style={{
          minHeight: 88,
          paddingVertical: 16,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: c.line,
        }}
      >
        <Stack gap={4} style={{ flex: 1 }}>
          <Txt weight="700">Automatic start</Txt>
          <Txt
            size="caption"
            color={loaded && prefs.enabled ? c.accent : c.muted}
          >
            {loaded
              ? prefs.enabled
                ? `On · ${sportName}`
                : "Off · start recordings manually"
              : error || !profile
                ? "Preference unavailable"
                : "Loading preference…"}
          </Txt>
        </Stack>
        <Switch
          accessibilityLabel="Automatic start"
          disabled={busy || !loaded}
          value={loaded && prefs.enabled}
          onValueChange={(enabled) => void save({ ...prefs, enabled })}
          trackColor={{ true: c.accent }}
        />
      </Row>
      {busy && <LoadingJourney compact label="Updating automatic start…" />}
      <Stack gap={12}>
        <SectionHeading title="Activity type" />
        <Segmented
          value={prefs.sport}
          options={(["run", "ride", "walk", "hike"] as const).map((value) => ({
            value,
            label: value[0]!.toUpperCase() + value.slice(1),
          }))}
          onChange={(sport) => {
            if (!busy && loaded) void save({ ...prefs, sport });
          }}
        />
        <Txt size="caption" color={c.muted}>
          Used for the next automatic recording.
        </Txt>
      </Stack>
      <Stack gap={0}>
        <SectionHeading title="How it works" />
        <ListRow
          title="Keep RIVL open to start"
          detail="The first 90 seconds are not recorded. Poor GPS or interrupted movement resets detection."
        />
        <View style={{ height: 1, backgroundColor: c.line }} />
        <ListRow
          title="Lock the screen once recording"
          detail="An active recording can continue with the screen locked. Closing RIVL prevents new automatic starts."
        />
        <View style={{ height: 1, backgroundColor: c.line }} />
        <ListRow
          title="Review before saving"
          detail="You choose what to keep. Nothing is published automatically."
        />
      </Stack>
      <Stack gap={12}>
        <SectionHeading title="Location & movement" />
        {Platform.OS === "ios" ? (
          <Txt color={c.muted}>
            Requires Precise Location and matching Motion & Fitness signals.
          </Txt>
        ) : (
          <Notice text="GPS can mistake slow traffic for cycling. Enable ride mode only when you intend to cycle." />
        )}
        <Txt size="caption" color={c.muted}>
          Waiting for movement uses extra battery.
        </Txt>
        <Button
          title="Phone permissions"
          variant="quiet"
          icon={<Settings2 size={18} color={c.text} />}
          onPress={() => Linking.openSettings()}
          style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
        />
      </Stack>
      <Button
        title="Record manually"
        variant="secondary"
        icon={<PlayCircle size={19} color={c.text} />}
        onPress={() => router.navigate("/record")}
      />
    </Screen>
  );
}

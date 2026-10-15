import { userMessage } from "../src/security/errors";
import React, { useState, useEffect, useRef } from "react";
import { Pressable, Switch } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import { config, backendConfigured } from "../src/services/config";
import {
  Heart,
  ShieldCheck,
  Bike,
  Activity,
  Bluetooth,
  ChevronDown,
  ChevronRight,
  Bell,
  LogOut,
} from "lucide-react-native";
import { useStore } from "../src/state/store";
import {
  Screen,
  Stack,
  Row,
  Txt,
  Field,
  Button,
  Segmented,
  Choice,
  Notice,
  SectionHeading,
  ListRow,
  Pill,
} from "../src/ui/primitives";
import { SettingsSection } from "../src/ui/SettingsSection";
import { HeartRateZoneSettings } from "../src/ui/HeartRateZoneSettings";
import { useTheme, brand } from "../src/ui/theme";
import {
  health,
  recoveryInsight,
  type HealthSnapshot,
} from "../src/services/health";
import { database } from "../src/storage/database";
import {
  scheduleReminder,
  cancelReminder,
} from "../src/services/notifications";
export default function Settings() {
  const { profile, session, updateProfile, signOut, sync, activities } =
      useStore(),
    { c } = useTheme(),
    [name, setName] = useState(profile?.name ?? ""),
    [goal, setGoal] = useState(String((profile?.weeklyGoal ?? 40000) / 1000)),
    [maxHR, setMaxHR] = useState(String(profile?.maxHR ?? 190)),
    [ftp, setFtp] = useState(profile?.ftp ? String(profile.ftp) : ""),
    [weight, setWeight] = useState(
      profile?.weightKg ? String(profile.weightKg) : "",
    ),
    [birthYear, setBirthYear] = useState(
      profile?.birthYear ? String(profile.birthYear) : "",
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null),
    [reminder, setReminder] = useState<string | null>(null),
    [trainingDetails, setTrainingDetails] = useState(false);
  const actionInProgress = useRef(false);
  useEffect(() => {
    setMaxHR(String(profile?.maxHR ?? 190));
  }, [profile?.maxHR]);
  useEffect(() => {
    let active = true;
    setSnapshot(null);
    setMessage("");
    setName(profile?.name ?? "");
    setGoal(String((profile?.weeklyGoal ?? 40000) / 1000));
    setMaxHR(String(profile?.maxHR ?? 190));
    setFtp(profile?.ftp ? String(profile.ftp) : "");
    setWeight(profile?.weightKg ? String(profile.weightKg) : "");
    setBirthYear(profile?.birthYear ? String(profile.birthYear) : "");
    if (profile)
      void database
        .get<HealthSnapshot>("health:" + profile.id)
        .then((value) => {
          if (active) setSnapshot(value);
        })
        .catch((error) => {
          if (active) setMessage(userMessage(error));
        });
    void database
      .get<string>("reminder")
      .then((value) => {
        if (active) setReminder(value);
      })
      .catch((error) => {
        if (active) setMessage(userMessage(error));
      });
    return () => {
      active = false;
    };
  }, [profile?.id]);
  async function act(fn: () => Promise<unknown>) {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(userMessage(e));
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }
  if (!profile)
    return (
      <Screen title="Settings" back>
        <Txt>Sign in to manage your profile.</Txt>
      </Screen>
    );
  return (
    <Screen title="Settings" back>
      {!!message && <Notice text={message} />}
      <Stack gap={0}>
        <ListRow
          icon={<Bike size={20} color={c.text} />}
          title="Gear"
          detail="Shoes, bikes and their mileage"
          onPress={() => router.push("/gear")}
        />
        <ListRow
          icon={<Activity size={20} color={c.text} />}
          title="Automatic recording"
          detail="Start after sustained movement"
          onPress={() => router.push("/auto-record")}
        />
        <ListRow
          icon={<Bluetooth size={20} color={c.text} />}
          title="Devices & sensors"
          detail="Heart rate, power and cadence"
          onPress={() => router.push("/devices")}
        />
      </Stack>
      <SettingsSection title="Athlete profile">
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={100}
        />
        <Field
          label="Weekly distance goal"
          trailing={
            <Txt size="caption" color={c.muted}>
              km
            </Txt>
          }
          value={goal}
          onChangeText={setGoal}
          keyboardType="decimal-pad"
        />
        <Txt size="caption" weight="600">
          Speed units
        </Txt>
        <Segmented
          options={[
            { label: "km/h", value: "kmh" as const },
            { label: "mph", value: "mph" as const },
          ]}
          value={profile.speedUnit ?? "kmh"}
          onChange={(speedUnit) => void act(() => updateProfile({ speedUnit }))}
        />
        <Field
          label="Maximum heart rate"
          trailing={
            <Txt size="caption" color={c.muted}>
              bpm
            </Txt>
          }
          value={maxHR}
          onChangeText={setMaxHR}
          keyboardType="number-pad"
        />
        <Txt size="caption" color={c.muted}>
          Used for your heart-rate zones. Use a measured maximum when available;
          age-based values are estimates.
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More athlete details"
          accessibilityState={{ expanded: trainingDetails }}
          onPress={() => setTrainingDetails((open) => !open)}
          style={({ pressed }) => ({
            minHeight: 64,
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Row between>
            <Stack gap={3} style={{ flex: 1 }}>
              <Txt weight="600">More athlete details</Txt>
              <Txt size="caption" color={c.muted}>
                Power, body weight and birth year · optional
              </Txt>
            </Stack>
            {trainingDetails ? (
              <ChevronDown size={18} color={c.muted} />
            ) : (
              <ChevronRight size={18} color={c.muted} />
            )}
          </Row>
        </Pressable>
        {trainingDetails && (
          <Stack gap={16}>
            <Field
              label="Functional threshold power"
              trailing={
                <Txt size="caption" color={c.muted}>
                  W
                </Txt>
              }
              value={ftp}
              onChangeText={setFtp}
              keyboardType="number-pad"
              placeholder="Your measured FTP"
            />
            <Txt size="caption" color={c.muted}>
              FTP is your measured sustained cycling power. Leave it blank if
              you do not know it.
            </Txt>
            <Field
              label="Body weight"
              trailing={
                <Txt size="caption" color={c.muted}>
                  kg
                </Txt>
              }
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="For watts per kilogram"
            />
            <Field
              label="Birth year"
              value={birthYear}
              onChangeText={setBirthYear}
              keyboardType="number-pad"
              placeholder="For age-group rankings"
            />
          </Stack>
        )}
        <Button
          title="Save profile"
          loading={busy}
          onPress={() =>
            act(async () => {
              const g = Number(goal),
                hr = Number(maxHR),
                threshold = ftp.trim() ? Number(ftp) : null;
              if (
                !name.trim() ||
                !Number.isFinite(g) ||
                g < 1 ||
                g > 2000 ||
                !Number.isFinite(hr) ||
                !Number.isInteger(hr) ||
                hr < 100 ||
                hr > 240 ||
                (threshold !== null &&
                  (!Number.isFinite(threshold) ||
                    threshold < 50 ||
                    threshold > 1000))
              )
                throw new Error(
                  "Enter a name, a distance goal from 1–2,000 km, a whole-number maximum heart rate from 100–240 bpm, and optional FTP from 50–1,000 W.",
                );
              await updateProfile({
                name: name.trim(),
                weeklyGoal: g * 1000,
                maxHR: hr,
                ftp: threshold,
                weightKg: weight.trim() ? Number(weight) : null,
                birthYear: birthYear.trim() ? Number(birthYear) : null,
              });
              setMessage("Profile saved.");
            })
          }
        />
      </SettingsSection>
      <SettingsSection title="Heart-rate zones">
        <HeartRateZoneSettings
          key={profile.id}
          disabled={busy}
          onSavingChange={(saving) => {
            actionInProgress.current = saving;
            setBusy(saving);
          }}
        />
      </SettingsSection>
      <SettingsSection title="Segment participation" collapsible>
        <Choice
          label="Gender category (optional)"
          options={[
            { label: "Prefer not to specify", value: "" as const },
            { label: "Women", value: "women" as const },
            { label: "Men", value: "men" as const },
            { label: "Nonbinary", value: "nonbinary" as const },
          ]}
          value={profile.leaderboardGender ?? ""}
          onChange={(category) =>
            void act(() =>
              updateProfile({
                leaderboardGender: category || null,
                ...(category ? {} : { shareLeaderboardGender: false }),
              }),
            )
          }
        />
        <Row between>
          <Txt style={{ flex: 1 }}>Share gender category in rankings</Txt>
          <Switch
            accessibilityLabel="Share gender category in rankings"
            trackColor={{ true: brand.coral }}
            value={profile.shareLeaderboardGender === true}
            disabled={busy || !profile.leaderboardGender}
            onValueChange={(shareLeaderboardGender) =>
              void act(() => updateProfile({ shareLeaderboardGender }))
            }
          />
        </Row>
        <Txt size="caption" color={c.muted}>
          Your self-selected category stays private until you enable sharing.
          Turning sharing off removes you from gender-filtered public standings.
        </Txt>
        <Txt size="caption" color={c.muted}>
          Include eligible public activities in rankings after server GPS
          checks. Private activities, endpoint areas and privacy zones are
          excluded. GPS checks cannot rule out every false recording.
        </Txt>
        <Row between>
          <Txt style={{ flex: 1 }}>Participate in public segments</Txt>
          <Switch
            accessibilityLabel="Participate in public segments"
            trackColor={{ true: brand.coral }}
            disabled={busy}
            value={profile.segmentParticipation === true}
            onValueChange={(segmentParticipation) =>
              void act(() => updateProfile({ segmentParticipation }))
            }
          />
        </Row>
        <Row between>
          <Txt style={{ flex: 1 }}>Share age group in rankings</Txt>
          <Switch
            accessibilityLabel="Share age group in rankings"
            trackColor={{ true: brand.coral }}
            value={profile.shareLeaderboardAge === true}
            disabled={busy || !profile.birthYear}
            onValueChange={(shareLeaderboardAge) =>
              void act(() => updateProfile({ shareLeaderboardAge }))
            }
          />
        </Row>
        <Row between>
          <Txt style={{ flex: 1 }}>Share weight group in rankings</Txt>
          <Switch
            accessibilityLabel="Share weight group in rankings"
            trackColor={{ true: brand.coral }}
            value={profile.shareLeaderboardWeight === true}
            disabled={busy || !profile.weightKg}
            onValueChange={(shareLeaderboardWeight) =>
              void act(() => updateProfile({ shareLeaderboardWeight }))
            }
          />
        </Row>
        <Txt size="caption" color={c.muted}>
          Age and weight stay private unless you enable the corresponding group.
          Save the profile fields above before turning a group on.
        </Txt>
      </SettingsSection>
      <SettingsSection title="Display & accessibility" collapsible>
        <Txt size="caption" weight="600">
          Appearance
        </Txt>
        <Segmented
          options={[
            { label: "System", value: "system" },
            { label: "Light", value: "light" },
            { label: "Dark", value: "dark" },
          ]}
          value={profile.theme}
          onChange={(theme) => void act(() => updateProfile({ theme }))}
        />
        <Row between>
          <Txt style={{ flex: 1 }}>Increase contrast</Txt>
          <Switch
            accessibilityLabel="Increase contrast"
            disabled={busy}
            value={profile.highContrast}
            onValueChange={(highContrast) =>
              void act(() => updateProfile({ highContrast }))
            }
            trackColor={{ true: brand.coral }}
          />
        </Row>
        <Txt size="caption" color={c.muted}>
          Text follows your system size. Reduced motion and transparency
          preferences are respected.
        </Txt>
      </SettingsSection>
      <SettingsSection title="Recording" collapsible>
        <Row between>
          <Stack style={{ flex: 1 }} gap={4}>
            <Txt>Auto-pause</Txt>
            <Txt size="caption" color={c.muted}>
              Exclude stationary samples from moving time
            </Txt>
          </Stack>
          <Switch
            accessibilityLabel="Auto-pause"
            disabled={busy}
            value={profile.autoPause}
            onValueChange={(autoPause) =>
              void act(() => updateProfile({ autoPause }))
            }
            trackColor={{ true: brand.coral }}
          />
        </Row>
      </SettingsSection>
      <SettingsSection title="Health connections" collapsible>
        {snapshot ? (
          <>
            <Pill>{snapshot.source.toUpperCase()}</Pill>
            <Row>
              <Txt>Resting HR: {snapshot.restingHR ?? "—"} bpm</Txt>
              <Txt>HRV: {snapshot.hrv?.toFixed(0) ?? "—"} ms</Txt>
            </Row>
            <Txt>{recoveryInsight(snapshot)}</Txt>
            <Txt size="caption" color={c.muted}>
              Read {new Date(snapshot.readAt).toLocaleString()}. Missing
              readings can mean no data or access not granted.
            </Txt>
          </>
        ) : (
          <Txt color={c.muted}>
            Connect heart rate and HRV for context grounded in your own
            baseline. Health access is optional.
          </Txt>
        )}
        <Button
          title={snapshot ? "Refresh health data" : "Connect health data"}
          variant="secondary"
          loading={busy}
          icon={<Heart size={18} color={c.text} />}
          onPress={() =>
            act(async () => {
              const s = await health.connect();
              await database.set("health:" + profile.id, s);
              setSnapshot(s);
            })
          }
        />
      </SettingsSection>
      <SettingsSection title="Privacy" collapsible>
        <Txt color={c.muted}>
          Both endpoints are hidden within 200 metres on shared routes. Add a
          zone for places you want to keep private.
        </Txt>
        <Txt size="caption" weight="600">
          Default activity visibility
        </Txt>
        <Segmented
          options={[
            { label: "Private", value: "private" },
            { label: "Friends", value: "friends" },
            { label: "Public", value: "public" },
          ]}
          value={profile.visibility}
          onChange={(visibility) =>
            void act(() => updateProfile({ visibility }))
          }
        />
        {profile.privacyZones.map((z) => (
          <ListRow
            key={z.id}
            title={z.label}
            detail={`${z.radius} m protected radius`}
            tail={
              <Button
                variant="quiet"
                title="Remove"
                onPress={() =>
                  act(() =>
                    updateProfile({
                      privacyZones: profile.privacyZones.filter(
                        (p) => p.id !== z.id,
                      ),
                    }),
                  )
                }
              />
            }
          />
        ))}
        <Button
          title="Protect my current location"
          variant="secondary"
          icon={<ShieldCheck size={18} color={c.text} />}
          onPress={() =>
            act(async () => {
              const permission =
                await Location.requestForegroundPermissionsAsync();
              if (!permission.granted)
                throw new Error(
                  "Allow location access to create this privacy zone.",
                );
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
              });
              await updateProfile({
                privacyZones: [
                  ...profile.privacyZones,
                  {
                    id: Crypto.randomUUID(),
                    lat: location.coords.latitude,
                    lng: location.coords.longitude,
                    radius: 500,
                    label: "Private place " + (profile.privacyZones.length + 1),
                  },
                ],
              });
              setMessage("A 500-metre privacy zone has been added.");
            })
          }
        />
      </SettingsSection>
      <SettingsSection title="Reminders & sync" collapsible>
        <Button
          title={reminder ? "Turn off daily reminder" : "Remind me at 6 pm"}
          variant="secondary"
          icon={<Bell size={18} color={c.text} />}
          onPress={() =>
            act(async () => {
              if (reminder) {
                await cancelReminder(reminder);
                await database.remove("reminder");
                setReminder(null);
              } else {
                const id = await scheduleReminder();
                await database.set("reminder", id);
                setReminder(id);
              }
            })
          }
        />
        <Txt size="caption" color={c.muted}>
          {session?.local
            ? "Local account. Sign in with a cloud account to sync activities."
            : `${activities.filter((a) => a.sync !== "synced").length} activities waiting to sync.`}
        </Txt>
        <Button
          title="Retry sync"
          variant="secondary"
          disabled={session?.local}
          onPress={() =>
            act(async () => {
              await sync(true);
              setMessage(
                "Sync attempt complete. Saved activities remain safe on this device.",
              );
            })
          }
        />
      </SettingsSection>
      <SettingsSection title="Connected services" collapsible>
        <Txt weight="600">
          Google Maps · {config.googleMapsKey ? "Configured" : "Setup needed"}
        </Txt>
        <Txt size="caption" color={c.muted}>
          {config.googleMapsKey
            ? "A Google Maps key is configured. Availability depends on connection, enabled services and the key’s quota."
            : "Open in Google Maps works now. In-app Google listings need a Maps key; free OpenStreetMap guidance is available."}
        </Txt>
        <Button
          title="Open Google Maps setup"
          variant="secondary"
          onPress={() =>
            void act(() =>
              Linking.openURL("https://mapsplatform.google.com/maps-demo-key/"),
            )
          }
        />
        <Txt weight="600">
          Mapbox fallback ·{" "}
          {config.mapboxToken ? "Configured" : "Optional token needed"}
        </Txt>
        <Txt size="caption" color={c.muted}>
          Falls back for eligible GPS and open-map content when Google cannot
          load. Google place results stay on Google Maps.
        </Txt>
        <Txt weight="600">
          Google / Apple accounts ·{" "}
          {backendConfigured ? "Cloud connected" : "Setup needed"}
        </Txt>
      </SettingsSection>
      <Stack gap={8}>
        <SectionHeading title="Account & safety" />
        <ListRow
          title="Blocked athletes"
          detail="Manage who can interact with you"
          onPress={() => router.push("/blocked")}
        />
        <ListRow
          title="Delete account"
          detail="Permanently remove your account and its data"
          onPress={() => router.push("/delete-account")}
        />
      </Stack>
      <Button
        title="Sign out"
        variant="danger"
        icon={<LogOut size={18} color={c.accent} />}
        onPress={() =>
          act(async () => {
            await signOut();
            router.replace("/auth");
          })
        }
      />
    </Screen>
  );
}

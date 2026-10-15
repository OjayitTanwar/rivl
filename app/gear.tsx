import React, { useCallback, useState } from "react";
import { Switch, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Bike, Footprints } from "lucide-react-native";
import { useStore } from "../src/state/store";
import { gearRepository } from "../src/services/gear";
import {
  gearStats,
  gearTypeForSport,
  validGear,
  type Gear,
  type GearAssignment,
  type GearType,
} from "../src/domain/gear";
import {
  Screen,
  Stack,
  Row,
  Txt,
  Button,
  Field,
  ListRow,
  Notice,
} from "../src/ui/primitives";
import { useTheme } from "../src/ui/theme";
import { userMessage } from "../src/security/errors";

export default function GearPage() {
  const { profile, activities } = useStore();
  const { activity: activityId } = useLocalSearchParams<{
    activity?: string;
  }>();
  const { c } = useTheme();
  const owner = profile?.id;
  const [data, setData] = useState<{
    owner: string;
    gear: Gear[];
    assignments: GearAssignment[];
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Gear | null>(null);
  const [name, setName] = useState("");
  const [distance, setDistance] = useState("0");
  const [kind, setKind] = useState<GearType>("shoes");
  const [isDefault, setDefault] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setEditing(null);
      setError("");
      setLoading(true);
      if (!owner) {
        setLoading(false);
        return;
      }
      Promise.all([
        gearRepository.list(owner),
        gearRepository.assignments(owner),
      ])
        .then(([gear, assignments]) => {
          if (active) setData({ owner, gear, assignments });
        })
        .catch((e) => {
          if (active) setError(userMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [owner, revision]),
  );
  const gear = data && data.owner === owner ? data.gear : [];
  const assignments = data && data.owner === owner ? data.assignments : [];
  const activity = activities.find(
    (a) =>
      a.id === activityId && a.ownerId === owner && !a.demo && !a.simulated,
  );
  const selected = assignments.find((a) => a.activityId === activityId)?.gearId;
  const open = (g?: Gear) => {
    if (!owner) return;
    const next = g ?? {
      id: randomUUID(),
      ownerId: owner,
      name: "",
      type: activity ? gearTypeForSport(activity.sport) : ("shoes" as GearType),
      initialMeters: 0,
      addedAt: Date.now(),
      retired: false,
      isDefault: true,
    };
    setEditing(next);
    setName(next.name);
    setDistance(String(next.initialMeters / 1000));
    setKind(next.type);
    setDefault(next.isDefault);
    setError("");
  };
  const refresh = () => {
    setEditing(null);
    setRevision((v) => v + 1);
  };
  const save = async () => {
    if (!editing || editing.ownerId !== owner) return;
    let value: Gear;
    try {
      value = validGear({
        ...editing,
        name,
        type: kind,
        initialMeters: distance.trim() ? Number(distance) * 1000 : NaN,
        isDefault,
      });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    try {
      await gearRepository.save(value);
      refresh();
    } catch (e) {
      setError(userMessage(e));
    }
  };
  const assign = async (id: string | null) => {
    if (!activity) return;
    try {
      await gearRepository.assign(activity, id);
      refresh();
    } catch (e) {
      setError(userMessage(e));
    }
  };
  return (
    <Screen title={activityId ? "Activity gear" : "Gear"} back>
      {!owner ? (
        <Notice text="Sign in to manage your gear." />
      ) : (
        <Stack gap={20}>
          <Txt color={c.muted}>
            {activityId
              ? "Choose the shoes or bike used for this activity."
              : "Track every kilometre on your shoes and bikes."}
          </Txt>
          <Txt size="caption" color={c.muted}>
            Gear is private and saved on this device. Defaults apply to new
            recordings.
          </Txt>
          {!!error && (
            <Notice
              text={error}
              retry={editing ? undefined : () => setRevision((v) => v + 1)}
            />
          )}
          {loading ? <Txt color={c.muted}>Loading gear…</Txt> : null}
          {activityId && !activity && !loading && (
            <Notice text="Only your real saved activities can be linked to gear." />
          )}
          {editing && editing.ownerId === owner ? (
            <Stack gap={16}>
              <Txt size="heading" weight="700">
                {gear.some((g) => g.id === editing.id)
                  ? "Edit gear"
                  : "Add gear"}
              </Txt>
              <Field
                label="Name"
                value={name}
                onChangeText={setName}
                maxLength={60}
                placeholder="Daily trainers"
              />
              <Row>
                {(["shoes", "bike"] as const).map((type) => (
                  <Button
                    key={type}
                    title={type === "shoes" ? "Shoes" : "Bike"}
                    variant={kind === type ? "primary" : "secondary"}
                    disabled={gear.some((g) => g.id === editing.id)}
                    onPress={() => setKind(type)}
                    style={{ flex: 1 }}
                  />
                ))}
              </Row>
              <Field
                label="Starting distance (km)"
                value={distance}
                onChangeText={setDistance}
                keyboardType="decimal-pad"
              />
              <Row between>
                <Txt>
                  Use for new {kind === "bike" ? "rides" : "runs and walks"}
                </Txt>
                <Switch
                  accessibilityLabel="Default gear"
                  value={isDefault}
                  disabled={editing.retired}
                  onValueChange={setDefault}
                  trackColor={{ true: c.accent }}
                />
              </Row>
              <Button title="Save gear" onPress={save} />
              <Button
                title="Cancel"
                variant="quiet"
                onPress={() => setEditing(null)}
              />
              {gear.some((g) => g.id === editing.id) && (
                <Button
                  title={editing.retired ? "Restore gear" : "Retire gear"}
                  variant="secondary"
                  onPress={async () => {
                    try {
                      await gearRepository.save({
                        ...editing,
                        retired: !editing.retired,
                        isDefault: false,
                      });
                      refresh();
                    } catch (e) {
                      setError(userMessage(e));
                    }
                  }}
                />
              )}
            </Stack>
          ) : (
            <Stack gap={8}>
              {activity && (
                <Button
                  title={
                    selected ? "Remove gear from activity" : "No gear selected"
                  }
                  variant="secondary"
                  disabled={!selected}
                  onPress={() => assign(null)}
                />
              )}
              {gear
                .filter(
                  (g) =>
                    !activity ||
                    (g.type === gearTypeForSport(activity.sport) &&
                      (!g.retired || g.id === selected)),
                )
                .map((g) => {
                  const stats = gearStats(g, assignments, activities);
                  const Icon = g.type === "bike" ? Bike : Footprints;
                  return (
                    <View
                      key={g.id}
                      style={{
                        borderBottomWidth: 1,
                        borderBottomColor: c.line,
                      }}
                    >
                      <ListRow
                        title={g.name}
                        icon={<Icon size={24} color={c.text} />}
                        detail={`${(stats.meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km · ${stats.activities} activities${g.retired ? " · Retired" : g.isDefault ? " · Default" : ""}${selected === g.id ? " · Selected" : ""}`}
                        onPress={() => (activity ? assign(g.id) : open(g))}
                      />
                    </View>
                  );
                })}
              {!gear.length && !loading && (
                <Txt color={c.muted}>
                  Add your first pair of shoes or bike to begin tracking
                  mileage.
                </Txt>
              )}
              <Button title="Add gear" onPress={() => open()} />
            </Stack>
          )}
        </Stack>
      )}
    </Screen>
  );
}

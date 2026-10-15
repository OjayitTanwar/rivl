import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useStore } from "../state/store";
import { Field, Button, Txt, Notice, Stack, Row } from "./primitives";
import { useTheme } from "./theme";
import {
  defaultHeartRateZoneThresholds,
  heartRateZoneLabel,
  isValidHeartRateZoneThresholds,
} from "../domain/heart-rate-zones";
import { userMessage } from "../security/errors";
import { observedHeartRateLog } from "../domain/observed-heart-rate";

/** Settings has a separate save action so incomplete zone edits never alter profile fields. */
export function HeartRateZoneSettings({
  disabled = false,
  onSavingChange,
}: {
  disabled?: boolean;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { profile, activities, updateProfile } = useStore();
  const observations = useMemo(
    () => observedHeartRateLog(activities, profile?.id ?? ""),
    [activities, profile?.id],
  );
  const highest = observations.reduce<(typeof observations)[number] | null>(
    (peak, item) => (!peak || item.bpm > peak.bpm ? item : peak),
    null,
  );
  const { c } = useTheme();
  const [values, setValues] = useState(() =>
    (
      profile?.hrZoneThresholds ??
      defaultHeartRateZoneThresholds(profile?.maxHR)
    ).map(String),
  );
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const saving = useRef(false);
  const savedBoundaries = profile?.hrZoneThresholds?.join(",");
  useEffect(() => {
    if (!dirty.current)
      setValues(
        (
          profile?.hrZoneThresholds ??
          defaultHeartRateZoneThresholds(profile?.maxHR)
        ).map(String),
      );
  }, [profile?.maxHR, savedBoundaries]);
  if (!profile) return null;
  const activeBoundaries =
    profile.hrZoneThresholds ?? defaultHeartRateZoneThresholds(profile.maxHR);
  async function save(reset = false) {
    if (!profile || saving.current || disabled) return;
    setMessage("");
    const boundaries = values.map((value) =>
      value.trim() ? Number(value) : NaN,
    );
    if (!reset && !isValidHeartRateZoneThresholds(boundaries, profile.maxHR)) {
      setMessage(
        `Enter four increasing whole numbers from 30 to your saved maximum of ${profile.maxHR} bpm.`,
      );
      return;
    }
    saving.current = true;
    onSavingChange?.(true);
    setBusy(true);
    try {
      await updateProfile({
        hrZoneThresholds: reset
          ? null
          : (boundaries as [number, number, number, number]),
      });
      dirty.current = false;
      if (reset)
        setValues(defaultHeartRateZoneThresholds(profile.maxHR).map(String));
      setMessage(
        reset
          ? "Default zones restored for future activities."
          : "Personal zones saved for future activities.",
      );
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      saving.current = false;
      onSavingChange?.(false);
      setBusy(false);
    }
  }
  async function useObservedMaximum() {
    if (!highest || !profile || disabled || saving.current) return;
    saving.current = true;
    onSavingChange?.(true);
    setBusy(true);
    try {
      await updateProfile({ maxHR: highest.bpm });
      setMessage(
        "Recorded peak applied to future activities. Saved activities stay unchanged.",
      );
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      saving.current = false;
      onSavingChange?.(false);
      setBusy(false);
    }
  }
  return (
    <Stack gap={12}>
      <Txt weight="600">Automatic heart-rate log</Txt>
      <Txt size="caption" color={c.muted}>
        {highest
          ? `Highest sustained reading: ${highest.bpm} bpm · ${new Date(highest.at).toLocaleDateString()}`
          : "Connect a heart-rate sensor or import a workout with heart-rate samples to start your log."}
      </Txt>
      <Txt size="caption" color={c.muted}>
        Logs stable readings over at least 10 seconds from saved workouts.
        Spikes and simulated workouts are excluded. Your recorded peak may be
        below your true maximum; zones change only when you choose.
      </Txt>
      {observations.slice(0, 3).map((item) => (
        <Row between key={item.activityId}>
          <Txt size="caption" color={c.muted}>
            {new Date(item.at).toLocaleDateString()}
          </Txt>
          <Txt size="caption" weight="600">
            {item.bpm} bpm
          </Txt>
        </Row>
      ))}
      {highest && highest.bpm > profile.maxHR && (
        <Button
          title={`Use ${highest.bpm} bpm for future zones`}
          variant="secondary"
          disabled={disabled || busy}
          onPress={() => void useObservedMaximum()}
        />
      )}
      <Txt size="caption" color={c.muted}>
        Five heart-rate ranges describe your recorded effort, from easy in zone
        1 to very hard in zone 5. A connected heart-rate sensor lets you see how
        much time you spent in each range.
      </Txt>
      <Row between>
        <Txt weight="600" style={{ flex: 1 }}>
          {profile.hrZoneThresholds ? "Personal zones" : "Default zones"}
        </Txt>
        <Txt size="caption" color={c.muted}>
          Maximum {profile.maxHR} bpm
        </Txt>
      </Row>
      <Txt size="caption" color={c.muted}>
        {profile.hrZoneThresholds
          ? `Zones 2–5 start at ${activeBoundaries.join(", ")} bpm.`
          : "Zones 2–5 start at 60%, 70%, 80% and 90% of your maximum."}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Customize heart-rate zones"
        accessibilityState={{ expanded: editing }}
        onPress={() => setEditing((open) => !open)}
        style={({ pressed }) => ({
          minHeight: 48,
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Row between>
          <Txt weight="600">Customize zones</Txt>
          {editing ? (
            <ChevronDown size={18} color={c.muted} />
          ) : (
            <ChevronRight size={18} color={c.muted} />
          )}
        </Row>
      </Pressable>
      {editing && (
        <Stack gap={16}>
          <Txt size="caption" color={c.muted}>
            Enter the starting heart rate for each zone. Save any change to your
            maximum in Athlete profile first.
          </Txt>
          {values.map((value, index) => (
            <Field
              key={index}
              label={`Zone ${index + 2} starts at`}
              trailing={
                <Txt size="caption" color={c.muted}>
                  bpm
                </Txt>
              }
              value={value}
              keyboardType="number-pad"
              editable={!busy}
              onChangeText={(text) => {
                dirty.current = true;
                setMessage("");
                setValues((current) =>
                  current.map((entry, i) => (i === index ? text : entry)),
                );
              }}
            />
          ))}
          <Stack gap={8}>
            <Txt size="caption" weight="600">
              Saved ranges
            </Txt>
            {activeBoundaries.map((_, index) => (
              <Row between key={index}>
                <Txt size="caption">Zone {index + 1}</Txt>
                <Txt size="caption" color={c.muted}>
                  {heartRateZoneLabel(index, activeBoundaries)}
                </Txt>
              </Row>
            ))}
            <Row between>
              <Txt size="caption">Zone 5</Txt>
              <Txt size="caption" color={c.muted}>
                {heartRateZoneLabel(4, activeBoundaries)}
              </Txt>
            </Row>
          </Stack>
          <Button
            title="Save zones"
            loading={busy}
            disabled={disabled && !busy}
            onPress={() => void save()}
          />
          <Button
            title="Use default zones"
            variant="secondary"
            disabled={
              disabled || busy || (!profile.hrZoneThresholds && !dirty.current)
            }
            onPress={() => void save(true)}
          />
        </Stack>
      )}
      {!!message && <Notice text={message} />}
      <Txt size="caption" color={c.muted}>
        Changes apply to future activities. Saved zone totals and training load
        stay unchanged. Zones describe effort; they are not a health assessment.
      </Txt>
    </Stack>
  );
}

import { SettingsSection } from "../src/ui/SettingsSection";
import React, { useCallback, useRef, useState } from "react";
import { router, useFocusEffect, type Href } from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Stack,
  Txt,
  Button,
  Field,
  Notice,
  Empty,
  ListRow,
} from "../src/ui/primitives";
import { useTheme } from "../src/ui/theme";
import {
  moderationRoles,
  moderationQueue,
  decideModeration,
  type ModerationItem,
  type ModerationRoles,
} from "../src/services/moderation-console";
import { userMessage } from "../src/security/errors";
export default function Moderation() {
  const { profile, session } = useStore(),
    { c } = useTheme(),
    owner = profile?.id;
  const current = useRef(owner);
  current.current = owner;
  const [roles, setRoles] = useState<ModerationRoles | null>(null),
    [items, setItems] = useState<ModerationItem[]>([]),
    [selected, setSelected] = useState<ModerationItem | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setRoles(null);
      setItems([]);
      setSelected(null);
      setReason("");
      setError("");
      setLoading(false);
      if (owner && !session?.local) {
        setLoading(true);
        void (async () => {
          try {
            const access = await moderationRoles(owner);
            const rows = access.moderator ? await moderationQueue(owner) : [];
            if (active && current.current === owner) {
              setRoles(access);
              setItems(rows);
            }
          } catch (e) {
            if (active && current.current === owner) setError(userMessage(e));
          } finally {
            if (active && current.current === owner) setLoading(false);
          }
        })();
      }
      return () => {
        active = false;
      };
    }, [owner, session?.local, revision]),
  );
  async function decide(decision: "hide" | "dismiss") {
    if (!owner || !selected || lock.current) return;
    lock.current = true;
    setLoading(true);
    setError("");
    try {
      await decideModeration(owner, selected, decision, reason);
      if (current.current === owner) setRevision((v) => v + 1);
    } catch (e) {
      if (current.current === owner) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (current.current === owner) setLoading(false);
    }
  }
  return (
    <Screen title="Review console" back>
      <Stack gap={20}>
        {loading && (
          <Txt size="caption" color={c.muted}>
            Loading reviews…
          </Txt>
        )}
        {!!error && (
          <Notice text={error} retry={() => setRevision((v) => v + 1)} />
        )}
        {!owner || session?.local ? (
          <Empty
            title="Cloud account required"
            body="Review access is assigned by an operator."
          />
        ) : roles && !roles.moderator && !roles.trackReviewer ? (
          <Empty
            title="Review access required"
            body="Only assigned reviewers can open queues."
          />
        ) : null}
        {roles?.trackReviewer && (
          <Button
            title="Community path reviews"
            variant="secondary"
            onPress={() => router.push("/track-review" as Href)}
          />
        )}
        {roles?.moderator && (
          <>
            {selected ? (
              <SettingsSection title={selected.title}>
                <Txt size="caption" color={c.muted}>
                  {selected.kind} · {selected.reason}
                </Txt>
                {!!selected.excerpt && <Txt>{selected.excerpt}</Txt>}
                {selected.kind === "creator" && (
                  <Txt size="caption" color={c.muted}>
                    Hide pauses all programs from this creator pending operator
                    review.
                  </Txt>
                )}
                <Field
                  label="Decision reason"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  maxLength={500}
                  editable={!loading}
                />
                <Button
                  title={
                    selected.kind === "creator"
                      ? "Pause creator publications"
                      : "Hide reported content"
                  }
                  disabled={loading || !reason.trim()}
                  onPress={() => void decide("hide")}
                />
                <Button
                  title="Dismiss report"
                  variant="secondary"
                  disabled={loading || !reason.trim()}
                  onPress={() => void decide("dismiss")}
                />
                <Button
                  title="Back to queue"
                  variant="quiet"
                  disabled={loading}
                  onPress={() => {
                    setSelected(null);
                    setReason("");
                  }}
                />
              </SettingsSection>
            ) : (
              <SettingsSection title="Reported content">
                {!loading && !items.length && (
                  <Empty
                    title="Queue clear"
                    body="No open content, route or program reports."
                  />
                )}
                {items.map((item) => (
                  <ListRow
                    key={`${item.kind}:${item.id}`}
                    title={item.title}
                    detail={`${item.kind} · ${item.reason}`}
                    onPress={() => {
                      setSelected(item);
                      setReason("");
                    }}
                  />
                ))}
                {!!items.length && (
                  <Txt size="caption" color={c.muted}>
                    Up to 20 oldest reports. Decisions are recorded.
                  </Txt>
                )}
                <Button
                  title="Refresh queue"
                  variant="quiet"
                  disabled={loading}
                  onPress={() => setRevision((v) => v + 1)}
                />
              </SettingsSection>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
}

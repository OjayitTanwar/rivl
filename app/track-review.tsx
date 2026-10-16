import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Stack,
  Button,
  Field,
  Empty,
  Notice,
  ListRow,
} from "../src/ui/primitives";
import RouteMap from "../src/ui/RouteMap";
import { useTheme } from "../src/ui/theme";
import {
  corridorReviewQueue,
  reviewCorridor,
  type CommunityCorridor,
} from "../src/services/community-corridors";
import { userMessage } from "../src/security/errors";
export default function TrackReview() {
  const { profile, session } = useStore(),
    { c } = useTheme(),
    owner = profile?.id;
  const current = useRef(owner);
  current.current = owner;
  const [items, setItems] = useState<CommunityCorridor[]>([]),
    [selected, setSelected] = useState<CommunityCorridor | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setItems([]);
      setSelected(null);
      setReason("");
      setError("");
      if (owner && !session?.local) {
        setLoading(true);
        void corridorReviewQueue(owner)
          .then((rows) => {
            if (active && current.current === owner) setItems(rows);
          })
          .catch((e) => {
            if (active) setError(userMessage(e));
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      }
      return () => {
        active = false;
      };
    }, [owner, session?.local, revision]),
  );
  async function decide(publish: boolean) {
    if (!owner || !selected || lock.current) return;
    lock.current = true;
    setLoading(true);
    setError("");
    try {
      await reviewCorridor(owner, selected, publish, reason);
      if (current.current === owner) setRevision((v) => v + 1);
    } catch (e) {
      if (current.current === owner) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (current.current === owner) setLoading(false);
    }
  }
  return (
    <Screen title="Track review" back>
      {!!error && (
        <Notice text={error} retry={() => setRevision((v) => v + 1)} />
      )}
      {loading && (
        <Txt size="caption" color={c.muted}>
          Loading…
        </Txt>
      )}
      {!loading && !error && !items.length && (
        <Empty
          title="No paths to review"
          body="A reviewer account is required."
        />
      )}
      {selected ? (
        <Stack gap={16}>
          <RouteMap
            points={selected.points.map((p) => ({
              ...p,
              t: 0,
              accuracy: 0,
              segment: 0,
            }))}
            height={300}
            allowMapboxFallback
            localFocus
          />
          <Txt size="caption" color={c.muted}>
            Reconstructed GPS evidence · {selected.sport}. Check the geometry
            and source context. Access, protection and connectivity remain
            unknown.
          </Txt>
          <Field
            label="Review reason"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
            editable={!loading}
          />
          <Button
            title="Publish reviewed geometry"
            disabled={loading || !reason.trim()}
            onPress={() => void decide(true)}
          />
          <Button
            title="Withdraw proposal"
            variant="danger"
            disabled={loading || !reason.trim()}
            onPress={() => void decide(false)}
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
        </Stack>
      ) : (
        items.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.sport[0]!.toUpperCase() + item.sport.slice(1)} path`}
            detail={
              item.state === "disputed"
                ? "Reported · review needed"
                : "New geometric proposal"
            }
            onPress={() => {
              setSelected(item);
              setReason("");
            }}
          />
        ))
      )}
    </Screen>
  );
}

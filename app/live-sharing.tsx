import React, { useCallback, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useStore } from "../src/state/store";
import { engine } from "../src/services/recording";
import {
  liveShares,
  liveFriends,
  startLiveShare,
  stopLiveShare,
  updateLiveShare,
} from "../src/services/live-sharing";
import { livePointFresh, type LiveShare } from "../src/domain/live-sharing";
import {
  Screen,
  Stack,
  Txt,
  Button,
  ListRow,
  Notice,
  Empty,
} from "../src/ui/primitives";
import { SettingsSection } from "../src/ui/SettingsSection";
import { useTheme } from "../src/ui/theme";
import { userMessage } from "../src/security/errors";
export default function LiveSharing() {
  const { session } = useStore(),
    { c } = useTheme(),
    owner = session && !session.local ? session.userId : null;
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    shares: LiveShare[];
    friends: { id: string; name: string }[];
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [friendLimit, setFriendLimit] = useState(10),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [tick, setTick] = useState(Date.now());
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const shares = snapshot?.owner === owner ? snapshot.shares : [],
    friends = snapshot?.owner === owner ? snapshot.friends : [];
  const own = shares.find((s) => s.ownerId === owner);
  const paused = useRef(new Set<string>()),
    lock = useRef(false),
    focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      let active = true,
        timer: ReturnType<typeof setTimeout> | undefined;
      setSelected([]);
      setFriendLimit(10);
      setError("");
      const refresh = async () => {
        if (!owner || !active) return;
        if (AppState.currentState === "active")
          try {
            const [next, people] = await Promise.all([
              liveShares(owner),
              liveFriends(owner),
            ]);
            if (active && currentOwner.current === owner) {
              setSnapshot({ owner, shares: next, friends: people });
              setError("");
              setTick(Date.now());
            }
            const share = next.find((s) => s.ownerId === owner);
            if (
              share &&
              !paused.current.has(share.id) &&
              active &&
              currentOwner.current === owner
            ) {
              const permission = await Location.getForegroundPermissionsAsync();
              if (permission.granted && active) {
                const recording = await engine.active();
                let point: {
                  lat: number;
                  lng: number;
                  accuracy: number;
                  t: number;
                } | null = null;
                if (
                  recording?.ownerId === owner &&
                  recording.state === "recording" &&
                  !recording.simulation
                )
                  point = (await engine.stats(recording.id)).last;
                else {
                  // One foreground sample; reuse the recording engine whenever it owns GPS.
                  let deadline: ReturnType<typeof setTimeout> | undefined;
                  try {
                    const loc = await Promise.race([
                      Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                      }),
                      new Promise<never>((_, reject) => {
                        deadline = setTimeout(
                          () =>
                            reject(
                              new Error(
                                "GPS unavailable. Your last shared point is unchanged.",
                              ),
                            ),
                          12000,
                        );
                      }),
                    ]);
                    point = {
                      lat: loc.coords.latitude,
                      lng: loc.coords.longitude,
                      accuracy: loc.coords.accuracy ?? Infinity,
                      t: loc.timestamp,
                    };
                  } finally {
                    if (deadline) clearTimeout(deadline);
                  }
                }
                if (
                  point &&
                  active &&
                  AppState.currentState === "active" &&
                  !paused.current.has(share.id) &&
                  currentOwner.current === owner
                )
                  await updateLiveShare(owner, share.id, point);
              }
            }
          } catch (e) {
            if (active && currentOwner.current === owner)
              setError(userMessage(e));
          }
        if (active) timer = setTimeout(() => void refresh(), 15000);
      };
      void refresh();
      const state = AppState.addEventListener("change", () => {
        setTick(Date.now());
      });
      return () => {
        active = false;
        focused.current = false;
        if (timer) clearTimeout(timer);
        state.remove();
      };
    }, [owner]),
  );
  async function start() {
    if (!owner || lock.current || !selected.length) return;
    lock.current = true;
    setPending(true);
    setError("");
    const id = owner;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error("Allow location in Settings before sharing.");
      if (currentOwner.current !== id || !focused.current) return;
      const share = await startLiveShare(id, selected);
      if (currentOwner.current === id)
        setSnapshot((prev) => ({
          owner: id,
          friends: prev?.owner === id ? prev.friends : [],
          shares: [
            share,
            ...(prev?.owner === id
              ? prev.shares.filter((s) => s.ownerId !== id)
              : []),
          ],
        }));
    } catch (e) {
      if (currentOwner.current === id) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (currentOwner.current === id) setPending(false);
    }
  }
  async function stop() {
    if (!owner || !own || lock.current) return;
    const id = owner,
      share = own;
    paused.current.add(share.id);
    lock.current = true;
    setPending(true);
    setError("");
    try {
      await stopLiveShare(id, share.id);
      if (currentOwner.current === id)
        setSnapshot((prev) =>
          prev?.owner === id
            ? { ...prev, shares: prev.shares.filter((s) => s.id !== share.id) }
            : prev,
        );
    } catch (e) {
      if (currentOwner.current === id)
        setError(
          "Updates paused on this phone. Reconnect and tap Stop sharing again to revoke access. The server session expires within one hour.",
        );
    } finally {
      lock.current = false;
      if (currentOwner.current === id) setPending(false);
    }
  }
  return (
    <Screen
      title="Live sharing"
      subtitle="Share your latest location with selected friends."
    >
      <Stack gap={24}>
        {!owner ? (
          <Empty
            title="Connect your account"
            body="Live sharing needs a cloud account and accepted friends."
          />
        ) : (
          <>
            {!!error && <Notice text={error} />}
            <SettingsSection
              title={own ? "Your live session" : "Share for one hour"}
            >
              <Txt color={c.muted}>
                Updates while this page is open. Friends see the latest point,
                never a route history.
              </Txt>
              {own ? (
                <>
                  <Txt>
                    {own.recipientCount} selected friends · ends{" "}
                    {new Date(own.expiresAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Txt>
                  <Txt color={c.muted}>
                    {paused.current.has(own.id)
                      ? "Updates paused; server stop unconfirmed."
                      : own.point
                        ? `Last shared ${Math.max(0, Math.floor((tick - own.point.sampledAt) / 1000))} seconds ago`
                        : "Waiting for a fresh GPS point…"}
                  </Txt>
                  <Button
                    title="Stop sharing"
                    variant="danger"
                    disabled={pending}
                    onPress={() => void stop()}
                  />
                </>
              ) : (
                <>
                  {!friends.length && (
                    <Txt color={c.muted}>
                      Accept a friend connection to begin.
                    </Txt>
                  )}
                  {friends.slice(0, friendLimit).map((friend) => (
                    <ListRow
                      key={friend.id}
                      title={friend.name}
                      detail={
                        selected.includes(friend.id)
                          ? "Selected"
                          : "Tap to select"
                      }
                      onPress={() => {
                        if (!pending)
                          setSelected((ids) =>
                            ids.includes(friend.id)
                              ? ids.filter((id) => id !== friend.id)
                              : ids.length < 10
                                ? [...ids, friend.id]
                                : ids,
                          );
                      }}
                    />
                  ))}
                  {friends.length > friendLimit && (
                    <Button
                      title="Show more friends"
                      variant="quiet"
                      onPress={() => setFriendLimit((limit) => limit + 10)}
                    />
                  )}
                  <Button
                    title="Start sharing"
                    disabled={pending || !selected.length}
                    onPress={() => void start()}
                  />
                  <Button
                    title="Location settings"
                    variant="quiet"
                    onPress={() => void Linking.openSettings()}
                  />
                </>
              )}
            </SettingsSection>
            <SettingsSection title="Friends sharing with you">
              {!shares.some((s) => s.ownerId !== owner) && (
                <Txt color={c.muted}>No active shares.</Txt>
              )}
              {shares
                .filter((s) => s.ownerId !== owner)
                .map((share) => (
                  <Stack key={share.id} gap={8}>
                    <Txt weight="600">{share.name}</Txt>
                    <Txt color={c.muted}>
                      {share.point
                        ? `${livePointFresh(share, tick) ? "Recent" : "Stale"} · ${Math.max(0, Math.floor((tick - share.point.sampledAt) / 1000))} seconds old · ±${Math.round(share.point.accuracy)} m`
                        : "Waiting for their first GPS point"}
                    </Txt>
                    {!!share.point && (
                      <Button
                        title="View latest point"
                        variant="secondary"
                        onPress={() => {
                          const p = share.point!;
                          void Linking.openURL(
                            `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=Shared%20location`,
                          ).catch(() => setError("Unable to open Maps."));
                        }}
                      />
                    )}
                  </Stack>
                ))}
            </SettingsSection>
            <Txt size="caption" color={c.muted}>
              No background updates or emergency alerts. Friends refresh about
              every 15 seconds. A network outage can leave an older point
              visible.
            </Txt>
          </>
        )}
      </Stack>
    </Screen>
  );
}

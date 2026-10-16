import React, { useCallback, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Stack,
  Txt,
  Field,
  Button,
  Notice,
  Empty,
  ListRow,
} from "../src/ui/primitives";
import { SettingsSection } from "../src/ui/SettingsSection";
import { useTheme } from "../src/ui/theme";
import { userMessage } from "../src/security/errors";
import {
  clubDetail,
  createClub,
  setClubMembership,
  setClubRole,
  createClubEvent,
  clubRsvp,
  cancelClubEvent,
} from "../src/services/club-events";
import type { ClubDetail } from "../src/domain/club-events";
export default function ClubPage() {
  const params = useLocalSearchParams<{ id?: string }>(),
    club = typeof params.id === "string" ? params.id : undefined;
  const { session } = useStore(),
    { c } = useTheme(),
    owner = session && !session.local ? session.userId : null;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [snapshot, setSnapshot] = useState<{
      owner: string;
      club: ClubDetail;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [pending, setPending] = useState(false),
    [revision, setRevision] = useState(0);
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [title, setTitle] = useState(""),
    [meeting, setMeeting] = useState(""),
    [start, setStart] = useState(""),
    [zone, setZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [duration, setDuration] = useState("60"),
    [capacity, setCapacity] = useState("20"),
    [eventEditor, setEventEditor] = useState(false),
    [memberLimit, setMemberLimit] = useState(10);
  React.useEffect(() => {
    setName("");
    setDescription("");
    setTitle("");
    setMeeting("");
    setStart("");
    setEventEditor(false);
    setError("");
  }, [owner]);
  const lock = useRef(false),
    generation = useRef(0);
  const detail =
    snapshot?.owner === owner && snapshot.club.id === club
      ? snapshot.club
      : null;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const token = ++generation.current;
      setError("");
      setEventEditor(false);
      setMemberLimit(10);
      if (owner && club) {
        setLoading(true);
        void clubDetail(owner, club)
          .then((data) => {
            if (
              active &&
              token === generation.current &&
              ownerRef.current === owner
            )
              setSnapshot({ owner, club: data });
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
        generation.current++;
      };
    }, [owner, club, revision]),
  );
  const act = async (work: (owner: string) => Promise<unknown>) => {
    if (!owner || lock.current) return;
    const id = owner;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      await work(id);
      if (ownerRef.current === id) {
        setRevision((r) => r + 1);
        setEventEditor(false);
      }
    } catch (e) {
      if (ownerRef.current === id) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id) setPending(false);
    }
  };
  const confirm = (message: string, work: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(message)) work();
    } else
      Alert.alert("Confirm", message, [
        { text: "Keep", style: "cancel" },
        { text: "Confirm", onPress: work },
      ]);
  };
  const organizer = detail?.role === "owner" || detail?.role === "moderator";
  return (
    <Screen title={club ? (detail?.name ?? "Club") : "Create club"} back>
      <Stack gap={24}>
        {!owner ? (
          <Empty
            title="Connect your account"
            body="Club events need a cloud account."
          />
        ) : (
          <>
            {!!error && <Notice text={error} />}
            {loading && !detail && <Txt color={c.muted}>Loading club…</Txt>}
            {!club ? (
              <SettingsSection title="Your club">
                <Field
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  maxLength={80}
                  editable={!pending}
                />
                <Field
                  label="Short description"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={500}
                  editable={!pending}
                />
                <Button
                  title="Create club"
                  disabled={pending || !name.trim()}
                  onPress={() =>
                    void act(async (id) => {
                      const created = await createClub(id, name, description);
                      if (ownerRef.current === id)
                        router.replace(`/club-detail?id=${created}` as Href);
                    })
                  }
                />
              </SettingsSection>
            ) : detail ? (
              <>
                <SettingsSection
                  title={`${detail.memberCount} members · ${detail.role}`}
                >
                  {!!detail.description && (
                    <Txt color={c.muted}>{detail.description}</Txt>
                  )}
                  {detail.role === "visitor" ? (
                    <Button
                      title="Join club"
                      disabled={pending}
                      onPress={() =>
                        void act((id) => setClubMembership(id, club, true))
                      }
                    />
                  ) : detail.role !== "owner" ? (
                    <Button
                      title="Leave club"
                      variant="quiet"
                      disabled={pending}
                      onPress={() =>
                        confirm(
                          "Leave this club and remove your upcoming RSVPs?",
                          () =>
                            void act((id) =>
                              setClubMembership(id, club, false),
                            ),
                        )
                      }
                    />
                  ) : null}
                </SettingsSection>
                {detail.role !== "visitor" && (
                  <>
                    <SettingsSection title="Meetups">
                      {!!organizer && (
                        <Button
                          title={
                            eventEditor ? "Close event form" : "Create meetup"
                          }
                          variant="secondary"
                          disabled={pending}
                          onPress={() => setEventEditor((v) => !v)}
                        />
                      )}
                      {eventEditor && (
                        <Stack gap={12}>
                          <Field
                            label="Event title"
                            value={title}
                            onChangeText={setTitle}
                            maxLength={100}
                            editable={!pending}
                          />
                          <Field
                            label="Meeting point"
                            value={meeting}
                            onChangeText={setMeeting}
                            maxLength={240}
                            editable={!pending}
                          />
                          <Field
                            label="Start date & time with UTC offset"
                            placeholder="2026-10-20T06:00+05:30"
                            value={start}
                            onChangeText={setStart}
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!pending}
                          />
                          <Field
                            label="Timezone"
                            value={zone}
                            onChangeText={setZone}
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!pending}
                          />
                          <Field
                            label="Duration (minutes)"
                            value={duration}
                            onChangeText={setDuration}
                            keyboardType="number-pad"
                            editable={!pending}
                          />
                          <Field
                            label="Places"
                            value={capacity}
                            onChangeText={setCapacity}
                            keyboardType="number-pad"
                            editable={!pending}
                          />
                          <Button
                            title="Publish meetup"
                            disabled={pending}
                            onPress={() =>
                              void act((id) =>
                                createClubEvent(id, club, {
                                  title,
                                  meetingPoint: meeting,
                                  start,
                                  timeZone: zone,
                                  duration,
                                  capacity,
                                }),
                              )
                            }
                          />
                        </Stack>
                      )}
                      {!detail.events.length && (
                        <Txt color={c.muted}>No meetups yet.</Txt>
                      )}
                      {detail.events.map((event) => (
                        <Stack key={event.id} gap={8}>
                          <Txt weight="600">
                            {event.title}
                            {event.cancelled ? " · Cancelled" : ""}
                          </Txt>
                          <Txt color={c.muted}>
                            {new Date(event.startsAt).toLocaleString(
                              undefined,
                              {
                                timeZone: event.timeZone,
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            )}{" "}
                            · {event.timeZone}
                          </Txt>
                          <Txt>{event.meetingPoint}</Txt>
                          <Txt size="caption" color={c.muted}>
                            {event.attending} / {event.capacity} attending ·{" "}
                            {Math.round(
                              (event.endsAt - event.startsAt) / 60000,
                            )}{" "}
                            min
                          </Txt>
                          {!event.cancelled && event.startsAt > Date.now() && (
                            <Button
                              title={
                                event.rsvp
                                  ? "Cancel my RSVP"
                                  : event.attending >= event.capacity
                                    ? "Full"
                                    : "Join meetup"
                              }
                              variant={event.rsvp ? "quiet" : "secondary"}
                              disabled={
                                pending ||
                                (!event.rsvp &&
                                  event.attending >= event.capacity)
                              }
                              onPress={() =>
                                void act((id) =>
                                  clubRsvp(id, event.id, !event.rsvp),
                                )
                              }
                            />
                          )}
                          {!!organizer &&
                            !event.cancelled &&
                            event.endsAt > Date.now() && (
                              <Button
                                title="Cancel meetup"
                                variant="quiet"
                                disabled={pending}
                                onPress={() =>
                                  confirm(
                                    "Cancel this meetup for everyone?",
                                    () =>
                                      void act((id) =>
                                        cancelClubEvent(id, event.id),
                                      ),
                                  )
                                }
                              />
                            )}
                        </Stack>
                      ))}
                    </SettingsSection>
                    <SettingsSection title="Members" collapsible>
                      {detail.members.slice(0, memberLimit).map((member) => (
                        <Stack key={member.id} gap={8}>
                          <ListRow title={member.name} detail={member.role} />
                          {detail.role === "owner" && member.id !== owner && (
                            <>
                              <Button
                                title={
                                  member.role === "moderator"
                                    ? "Remove organizer role"
                                    : "Make organizer"
                                }
                                variant="quiet"
                                disabled={pending}
                                onPress={() =>
                                  void act((id) =>
                                    setClubRole(
                                      id,
                                      club,
                                      member.id,
                                      member.role === "moderator"
                                        ? "member"
                                        : "moderator",
                                    ),
                                  )
                                }
                              />
                              <Button
                                title="Transfer ownership"
                                variant="quiet"
                                disabled={pending}
                                onPress={() =>
                                  confirm(
                                    `Make ${member.name} the club owner? You will become a member.`,
                                    () =>
                                      void act((id) =>
                                        setClubRole(
                                          id,
                                          club,
                                          member.id,
                                          "owner",
                                        ),
                                      ),
                                  )
                                }
                              />
                            </>
                          )}
                        </Stack>
                      ))}
                      {detail.members.length > memberLimit && (
                        <Button
                          title="Show more members"
                          variant="quiet"
                          onPress={() => setMemberLimit((n) => n + 10)}
                        />
                      )}
                      {detail.memberCount > 100 && (
                        <Txt size="caption" color={c.muted}>
                          Showing the first 100 members.
                        </Txt>
                      )}
                    </SettingsSection>
                  </>
                )}
              </>
            ) : !loading ? (
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => setRevision((r) => r + 1)}
              />
            ) : null}
            {pending && (
              <Txt size="caption" color={c.muted}>
                Saving…
              </Txt>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
}

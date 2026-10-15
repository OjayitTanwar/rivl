import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import {
  Heart,
  MessageCircle,
  Users,
  Trophy,
  Timer,
} from "lucide-react-native";
import { useStore } from "../../src/state/store";
import type { SocialPost } from "../../src/domain/types";
import {
  Txt,
  Pill,
  Stack,
  Row,
  Card,
  Button,
  Metric,
  Empty,
  Segmented,
  Field,
  ListRow,
  SectionHeading,
  Notice,
} from "../../src/ui/primitives";
import { RoutePreview } from "../../src/ui/RoutePreview";
import { SafetyActions } from "../../src/ui/SafetyActions";
import { useTheme, brand } from "../../src/ui/theme";
import { km, pace, relative } from "../../src/domain/format";
import { userMessage } from "../../src/security/errors";
import {
  clubs,
  people,
  follow,
  joinClub,
  type Club,
  type Person,
} from "../../src/services/social";
import { supabase } from "../../src/services/supabase";
import { challengeProgress } from "../../src/domain/analytics";
import { ProgressBar } from "../../src/ui/charts";

const destinations = [
  {
    title: "Segments",
    detail: "Compare your efforts",
    href: "/segments",
    Icon: Timer,
  },
  {
    title: "Leagues",
    detail: "Club competitions",
    href: "/leagues",
    Icon: Trophy,
  },
];
const Post = memo(function Post({
  post,
  userId,
  react,
}: {
  post: SocialPost;
  userId?: string;
  react: (id: string) => Promise<void>;
}) {
  const { c } = useTheme();
  const open = () =>
    router.push({
      pathname: "/activity/[id]",
      params: { id: post.activity.id },
    });
  const cheered = Boolean(userId && post.reactions.includes(userId));
  return (
    <Card
      style={{
        borderWidth: 0,
        borderRadius: 0,
        paddingHorizontal: 0,
        borderBottomWidth: 1,
        paddingBottom: 20,
      }}
    >
      <Row>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: post.color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt color={brand.ink} weight="700">
            {post.initials}
          </Txt>
        </View>
        <Stack gap={2} style={{ flex: 1 }}>
          <Txt weight="700">{post.athlete}</Txt>
          <Txt size="caption" color={c.muted}>
            {relative(post.activity.startedAt)} · {post.activity.sport}
          </Txt>
        </Stack>
        <SafetyActions
          compact
          id={post.id}
          owner={post.activity.ownerId}
          name={post.athlete}
        />
      </Row>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${post.activity.title}`}
        onPress={open}
        style={{ gap: 14 }}
      >
        <Txt size="heading" weight="700">
          {post.activity.title}
        </Txt>
        {!!post.caption && (
          <Txt color={c.muted} numberOfLines={3}>
            {post.caption}
          </Txt>
        )}
        <RoutePreview points={post.activity.route} />
        <Row>
          <Metric
            small
            value={km(post.activity.summary.distance)}
            unit="km"
            label="Distance"
          />
          <Metric
            small
            value={pace(post.activity.summary.avgPace)}
            unit="/km"
            label="Pace"
          />
          <Metric
            small
            value={String(Math.round(post.activity.summary.ascent))}
            unit="m"
            label="Climbed"
          />
        </Row>
      </Pressable>
      <Row style={{ flexWrap: "wrap" }}>
        <Button
          title={`${post.reactionCount ?? post.reactions.length} cheers`}
          variant="quiet"
          icon={
            <Heart
              size={19}
              color={cheered ? c.accent : c.muted}
              fill={cheered ? c.accent : "none"}
            />
          }
          onPress={() => react(post.id)}
        />
        <Button
          title={`${post.commentCount ?? post.comments.length} comments`}
          variant="quiet"
          icon={<MessageCircle size={19} color={c.muted} />}
          onPress={open}
        />
      </Row>
    </Card>
  );
});
type GroupTab = "clubs" | "challenges" | "people" | "activity";
export default function Community() {
  const store = useStore(),
    { c } = useTheme();
  const [tab, setTab] = useState<GroupTab>("clubs");
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Club[]>([]);
  const [athletes, setAthletes] = useState<Person[]>([]);
  const [error, setError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningChallenge, setJoiningChallenge] = useState<string | null>(null);
  const latest = useRef(store);
  const request = useRef(0);
  latest.current = store;
  const available = Boolean(store.session && !store.session.local && supabase);
  const loadDirectory = useCallback(async () => {
    const sequence = ++request.current;
    const current = latest.current;
    if (
      !current.session ||
      current.session.local ||
      !supabase ||
      !current.online
    )
      return;
    setLoading(true);
    setDirectoryError("");
    try {
      const [nextGroups, nextPeople] = await Promise.all([
        clubs(current.session),
        people(current.session, query),
      ]);
      if (sequence === request.current) {
        setGroups(nextGroups);
        setAthletes(nextPeople);
      }
    } catch (e) {
      if (sequence === request.current) setDirectoryError(userMessage(e));
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    if (available && store.online) void loadDirectory();
    else {
      ++request.current;
      setLoading(false);
    }
    return () => {
      ++request.current;
    };
  }, [available, store.online, store.session?.userId, loadDirectory]);
  useEffect(() => {
    setGroups([]);
    setAthletes([]);
    setDirectoryError("");
  }, [store.session?.userId, available]);
  const react = useCallback((id: string) => latest.current.react(id), []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      await latest.current.sync(true);
      await loadDirectory();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [loadDirectory]);
  async function act(action: () => Promise<unknown>) {
    setDirectoryError("");
    try {
      await action();
      await loadDirectory();
    } catch (e) {
      setDirectoryError(userMessage(e));
    }
  }
  async function toggleChallenge(challenge: (typeof store.challenges)[number]) {
    if (joiningChallenge) return;
    setJoiningChallenge(challenge.id);
    setDirectoryError("");
    try {
      await store.join(challenge);
    } catch (e) {
      setDirectoryError(userMessage(e));
    } finally {
      setJoiningChallenge(null);
    }
  }
  const renderPost = useCallback(
    ({ item }: { item: SocialPost }) => (
      <Post post={item} userId={store.session?.userId} react={react} />
    ),
    [store.session?.userId, react],
  );
  const emptyBody = !supabase
    ? "Community is unavailable in this version. Your recorded activities are still available in You."
    : store.session?.local
      ? "You’re using a local account. A cloud account lets you find clubs and other athletes."
      : !store.session
        ? "Sign in to find clubs and other athletes."
        : !store.online
          ? "Connect to the internet to refresh your community. Previously loaded items stay available."
          : "";
  const recovery = !supabase ? (
    <Button
      title="View your activities"
      variant="secondary"
      onPress={() => router.push("/you")}
    />
  ) : !store.online ? (
    <Button
      title="Try again"
      variant="secondary"
      onPress={() => void refresh()}
    />
  ) : !available ? (
    <Button
      title="Sign in to a cloud account"
      variant="secondary"
      onPress={() => router.push("/auth")}
    />
  ) : (
    <Button
      title="Refresh clubs"
      variant="secondary"
      onPress={() => void loadDirectory()}
    />
  );
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={tab === "activity" ? store.posts : []}
        keyExtractor={(post) => post.id}
        renderItem={renderPost}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentContainerStyle={{
          padding: 16,
          paddingTop: 12,
          paddingBottom: 120,
          gap: 20,
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        }}
        ListHeaderComponent={
          <Stack gap={20}>
            <Txt accessibilityRole="header" size="heading" weight="700">
              Groups
            </Txt>
            <Segmented
              compact
              options={[
                { label: "Clubs", value: "clubs" },
                { label: "Challenges", value: "challenges" },
                { label: "People", value: "people" },
                { label: "Activity", value: "activity" },
              ]}
              value={tab}
              onChange={setTab}
            />
            {!!(error || store.communityError) && (
              <Notice
                text={error || store.communityError!}
                retry={() => void refresh()}
              />
            )}
            {!!directoryError && tab !== "activity" && (
              <Notice
                text={directoryError}
                retry={() => void loadDirectory()}
              />
            )}
            {!store.online && (
              <Txt size="caption" color={c.muted}>
                Offline · showing previously loaded community data
              </Txt>
            )}
            {store.session?.demo && <Pill>Demo community</Pill>}
            {tab === "clubs" && (
              <Stack gap={0}>
                <SectionHeading title="Clubs" />
                <Txt
                  color={c.muted}
                  style={{ paddingTop: 8, paddingBottom: 16 }}
                >
                  Train together, wherever you start.
                </Txt>
                {loading && (
                  <ActivityIndicator
                    color={c.accent}
                    accessibilityLabel="Loading clubs"
                  />
                )}
                {groups.map((group) => (
                  <Stack
                    key={group.id}
                    gap={12}
                    style={{
                      paddingVertical: 20,
                      borderBottomWidth: 1,
                      borderBottomColor: c.line,
                    }}
                  >
                    <Row style={{ alignItems: "flex-start" }}>
                      <Users size={24} color={c.accent} />
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Txt size="subheading" weight="700">
                          {group.name}
                        </Txt>
                        {!!group.description && (
                          <Txt color={c.muted}>{group.description}</Txt>
                        )}
                      </Stack>
                      {group.joined && <Pill>Joined</Pill>}
                    </Row>
                    <Button
                      title={group.joined ? "Leave club" : "Join club"}
                      variant={group.joined ? "secondary" : "primary"}
                      disabled={!store.online}
                      style={{ alignSelf: "flex-start" }}
                      onPress={() => act(() => joinClub(store.session!, group))}
                    />
                  </Stack>
                ))}
                {!groups.length && !loading && !directoryError && (
                  <Empty
                    title={
                      !store.online
                        ? "You’re offline"
                        : !supabase
                          ? "Community unavailable"
                          : !available
                            ? "Find your community"
                            : "No clubs available"
                    }
                    action={recovery}
                    body={
                      emptyBody ||
                      "Clubs will appear here when they are available in your community."
                    }
                  />
                )}
              </Stack>
            )}
            {tab === "people" && (
              <Stack gap={16}>
                <Field
                  label="Search people"
                  testID="community-people-search"
                  placeholder="Athlete name"
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                />
                {loading && (
                  <ActivityIndicator
                    color={c.accent}
                    accessibilityLabel="Loading people"
                  />
                )}
                {athletes.map((person) => (
                  <Stack
                    key={person.id}
                    gap={12}
                    style={{
                      paddingVertical: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: c.line,
                    }}
                  >
                    <Stack gap={4}>
                      <Txt weight="700">{person.name}</Txt>
                      <Txt size="caption" color={c.muted}>
                        @{person.handle}
                      </Txt>
                    </Stack>
                    <Button
                      title={
                        person.friendship === "received"
                          ? "Accept request"
                          : person.friendship === "accepted"
                            ? "Remove friend"
                            : person.following
                              ? "Cancel request"
                              : "Add friend"
                      }
                      variant="secondary"
                      disabled={!store.online}
                      style={{ alignSelf: "flex-start" }}
                      onPress={() => act(() => follow(store.session!, person))}
                    />
                  </Stack>
                ))}
                {!athletes.length && !loading && !directoryError && (
                  <Empty
                    title={
                      query
                        ? "No matching people"
                        : "Find your training community"
                    }
                    body={
                      emptyBody ||
                      (query
                        ? "Try another athlete name."
                        : "Athletes in your community will appear here. Search by name to find someone.")
                    }
                  />
                )}
              </Stack>
            )}
            {tab === "challenges" && (
              <Stack gap={0}>
                <SectionHeading title="Challenges" />
                {store.challenges.map((challenge) => {
                  const progress = challengeProgress(
                    challenge,
                    store.activities,
                  );
                  const unit =
                    challenge.kind === "distance"
                      ? "km"
                      : challenge.kind === "ascent"
                        ? "m"
                        : "days";
                  const value =
                    challenge.kind === "distance"
                      ? km(progress, 0)
                      : String(Math.round(progress));
                  const target =
                    challenge.kind === "distance"
                      ? km(challenge.target, 0)
                      : String(challenge.target);
                  return (
                    <Stack
                      key={challenge.id}
                      gap={12}
                      style={{
                        paddingVertical: 20,
                        borderBottomWidth: 1,
                        borderBottomColor: c.line,
                      }}
                    >
                      <Txt size="subheading" weight="700">
                        {challenge.title}
                      </Txt>
                      <Txt size="caption" color={c.muted}>
                        Ends{" "}
                        {new Date(challenge.end).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                        {challenge.joined ? " · Joined" : ""}
                      </Txt>
                      <Txt mono weight="700">
                        {value} / {target} {unit}
                      </Txt>
                      <ProgressBar value={progress / (challenge.target || 1)} />
                      <Button
                        title={
                          challenge.joined
                            ? "Leave challenge"
                            : "Join challenge"
                        }
                        variant={challenge.joined ? "secondary" : "primary"}
                        loading={joiningChallenge === challenge.id}
                        disabled={
                          !store.session ||
                          (available && !store.online) ||
                          Boolean(joiningChallenge)
                        }
                        style={{ alignSelf: "flex-start" }}
                        onPress={() => void toggleChallenge(challenge)}
                      />
                    </Stack>
                  );
                })}
                {!store.challenges.length && (
                  <Empty
                    title="No challenges available"
                    body={
                      emptyBody ||
                      "Published community challenges will appear here. You can set a weekly distance goal in Settings."
                    }
                    action={
                      <Button
                        title="Set a weekly goal"
                        variant="secondary"
                        onPress={() => router.push("/settings")}
                      />
                    }
                  />
                )}
              </Stack>
            )}
          </Stack>
        }
        ListEmptyComponent={
          tab === "activity" ? (
            <Empty
              title="No shared activities yet"
              body={
                emptyBody ||
                "Activities shared by your community appear here. Find people to start connecting."
              }
              action={
                <Button
                  title="Find people"
                  variant="secondary"
                  onPress={() => setTab("people")}
                />
              }
            />
          ) : null
        }
        ListFooterComponent={
          <Stack gap={0} style={{ paddingTop: 12 }}>
            {destinations.map(({ title, detail, href, Icon }) => (
              <ListRow
                key={href}
                title={title}
                detail={detail}
                icon={<Icon size={22} color={c.muted} />}
                onPress={() => router.push(href as Href)}
              />
            ))}
          </Stack>
        }
      />
    </SafeAreaView>
  );
}

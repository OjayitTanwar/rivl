import {
  editActivityMetadata,
  type ActivityEdit,
} from "../domain/activity-edit";
import {
  cloudAccessToken,
  assertCurrentCloudUser,
  routeRepository,
} from "../services/routes";
import { waypointList } from "../domain/route-planning";
import {
  requestDeletion,
  deletionPending,
  clearCloudSession,
  sendDeletionCode as sendCode,
  requestDeletionWithCode,
  passwordDeletionAvailable,
} from "../services/account-deletion";
import {
  finishPasswordRecovery,
  beginPasswordRecovery,
} from "../services/password-recovery";
import { purgeAccountData } from "../services/account-data";
import { eraseAccountMedia } from "../services/media";
import { stopSource, engine } from "../services/recording";
import { cancelReminder } from "../services/notifications";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import type {
  Session,
  Profile,
  Activity,
  SocialPost,
  RoutePlan,
  Challenge,
  Segment,
  SegmentEffort,
} from "../domain/types";
import { database } from "../storage/database";
import { supabase, configurationError } from "../services/supabase";
import { AppFailure, userMessage } from "../security/errors";
import {
  emailInput,
  passwordInput,
  textInput,
  profileInput,
  numeric,
} from "../security/validation";
import { config } from "../services/config";
import { defaultProfile } from "../services/default-profile";
import { SyncEngine } from "../services/sync-engine";
import { remote } from "../services/remote";
import { refreshCommunity } from "../services/community";
import { connectWatch, watchBridge } from "../services/watch";
import { recoverRecording } from "../services/recording";
import { capture } from "../services/telemetry";
import { CommunityTrackRepository } from "../services/community-track-repository";
import { communityTrackPort } from "../services/community-track-sync";
import { prepareTrackEvidence } from "../domain/community-tracks";
import {
  beginProviderSignIn,
  finishProviderSignIn,
  type SignInProvider,
} from "../services/provider-signin";
import type { User } from "@supabase/supabase-js";
const syncEngine = new SyncEngine(database, remote);
const trackRepository = new CommunityTrackRepository(database);
interface Store {
  authenticateProvider(provider: SignInProvider): Promise<void>;
  completeProviderSignIn(code: string): Promise<void>;
  beginPasswordRecovery(email: string): Promise<void>;
  completePasswordRecovery(code: string, password: string): Promise<void>;
  loading: boolean;
  error: string | null;
  session: Session | null;
  profile: Profile | null;
  activities: Activity[];
  posts: SocialPost[];
  routes: RoutePlan[];
  challenges: Challenge[];
  segments: Segment[];
  efforts: SegmentEffort[];
  online: boolean;
  communityError: string | null;
  trackMappingError: string | null;
  refresh(): Promise<void>;
  authenticate(
    email: string,
    password: string,
    name?: string,
    accountMode?: "device" | "cloud",
  ): Promise<string | void>;
  signOut(): Promise<void>;
  deleteAccount(password: string): Promise<"completed" | "requested">;
  requestDeletionCode(): Promise<void>;
  deleteAccountWithCode(code: string): Promise<"completed" | "requested">;
  deletionNeedsPassword(): Promise<boolean>;
  updateProfile(p: Partial<Profile>): Promise<void>;
  saveActivity(a: Activity): Promise<void>;
  editActivity(
    id: string,
    revision: number,
    patch: ActivityEdit,
  ): Promise<void>;
  sync(force?: boolean): Promise<void>;
  react(id: string): Promise<void>;
  comment(id: string, text: string): Promise<void>;
  saveRoute(r: RoutePlan): Promise<void>;
  deleteRoute(id: string): Promise<void>;
  join(c: Challenge): Promise<void>;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [activities, setActivities] = useState<Activity[]>([]),
    [posts, setPosts] = useState<SocialPost[]>([]),
    [routes, setRoutes] = useState<RoutePlan[]>([]),
    [challenges, setChallenges] = useState<Challenge[]>([]),
    [segments, setSegments] = useState<Segment[]>([]),
    [efforts, setEfforts] = useState<SegmentEffort[]>([]),
    [online, setOnline] = useState(true),
    [communityError, setCommunityError] = useState<string | null>(null);
  const current = useRef<Session | null>(null);
  const [trackMappingFailure, setTrackMappingFailure] = useState<{
    owner: string;
    message: string;
  } | null>(null);
  const cloudAcceptance = useRef<{ id: string; task: Promise<void> } | null>(
    null,
  );
  const syncing = useRef<Promise<void> | null>(null);
  const initialized = useRef(false);
  const activityWrites = useRef<Promise<void>>(Promise.resolve());
  const load = useCallback(async (s: Session | null) => {
    current.current = s;
    setSession(s);
    if (!s) {
      setProfile(null);
      setActivities([]);
      setPosts([]);
      setRoutes([]);
      setChallenges([]);
      setSegments([]);
      setEfforts([]);
      return;
    }
    const [p, a, po, r, c, se, e] = await Promise.all([
      database.get<Profile>("profile:" + s.userId),
      database.list<Activity>("activity:" + s.userId + ":"),
      database.list<SocialPost>("post:" + s.userId + ":"),
      database.list<RoutePlan>("route:" + s.userId + ":"),
      database.list<Challenge>("challenge:" + s.userId + ":"),
      database.list<Segment>("segment:" + s.userId + ":"),
      database.list<SegmentEffort>("effort:" + s.userId + ":"),
    ]);
    if (current.current?.userId !== s.userId) return;
    setProfile(p ?? defaultProfile(s.userId));
    setActivities(
      a
        .map((activity) =>
          activity.demo && !s.demo
            ? { ...activity, simulated: true }
            : activity,
        )
        .sort((a, b) => b.startedAt - a.startedAt),
    );
    setPosts(po.sort((a, b) => b.activity.startedAt - a.activity.startedAt));
    setRoutes(r);
    setChallenges(c);
    setSegments(se);
    setEfforts(e);
  }, []);
  const cleanupAccount = useCallback(
    async (owner: Session) => {
      // This durable marker also resumes erasure after a process termination.
      await database.set("account:cleanup", owner);
      await stopSource();
      const reminder = await database.get<string>("reminder");
      if (reminder) {
        await cancelReminder(reminder);
        await database.remove("reminder");
      }
      await eraseAccountMedia(owner.userId);
      await watchBridge?.purge(owner.userId);
      await connectWatch(null).catch(() => {});
      await import("../services/sensors")
        .then((m) => m.disconnectAllSensors())
        .catch(() => {});
      await purgeAccountData(database, owner);
      await clearCloudSession(owner);
      await database.remove("account:cleanup");
      await load(null);
    },
    [load],
  );
  const initialize = useCallback(async () => {
    if (configurationError) throw configurationError;
    const cleanup = await database.get<Session>("account:cleanup");
    if (cleanup) await cleanupAccount(cleanup);
    if (await database.get("seed:v3"))
      await purgeAccountData(database, {
        userId: "00000000-0000-4000-8000-000000000001",
        email: "maya@example.test",
        demo: true,
        local: true,
      });
    let stored = await database.get<Session>("session");
    if (stored?.demo) {
      await purgeAccountData(database, stored);
      stored = null;
    }
    if (supabase && !stored?.local) {
      const { data, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      stored = data.session
        ? {
            userId: data.session.user.id,
            email: data.session.user.email ?? "",
            demo: false,
            local: false,
          }
        : null;
    } else if (!stored?.local) stored = null;
    await load(stored);
    if (stored) await recoverRecording(stored.userId);
    initialized.current = true;
  }, [load, cleanupAccount]);
  const refresh = useCallback(async () => {
    try {
      if (initialized.current) await load(current.current);
      else await initialize();
      setError(null);
    } catch (error) {
      setError(userMessage(error));
      throw error;
    }
  }, [load, initialize]);
  useEffect(() => {
    if (!loading)
      void connectWatch(profile?.id === session?.userId ? profile : null).catch(
        (error) => capture(error, { service: "watch" }),
      );
  }, [loading, profile?.id, session?.userId]);
  const sync = useCallback(
    (force = false): Promise<void> => {
      if (syncing.current) return syncing.current;
      const s = current.current;
      if (!s || s.local) return Promise.resolve();
      const task = (async () => {
        if (await deletionPending(s)) {
          await cleanupAccount(s);
          return;
        }
        await syncEngine.run(s.userId, Date.now(), force);
        if (current.current?.userId !== s.userId) return;
        try {
          await trackRepository.flush(
            s.userId,
            communityTrackPort,
            () => current.current?.userId === s.userId,
          );
          if (current.current?.userId === s.userId)
            setTrackMappingFailure(null);
        } catch (error) {
          capture(error, { service: "shared-map" });
          if (current.current?.userId === s.userId)
            setTrackMappingFailure({
              owner: s.userId,
              message: userMessage(error),
            });
        }
        if (current.current?.userId !== s.userId) return;
        try {
          await routeRepository.sync(s.userId);
          if (current.current?.userId !== s.userId) return;
          await refreshCommunity(s);
          if (current.current?.userId === s.userId) setCommunityError(null);
        } catch (error) {
          if (current.current?.userId === s.userId)
            setCommunityError(userMessage(error));
        }
        if (current.current?.userId === s.userId) await refresh();
      })();
      syncing.current = task.finally(() => {
        syncing.current = null;
      });
      return syncing.current;
    },
    [refresh, cleanupAccount],
  );
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initialize();
        if (mounted && current.current && !current.current.local)
          void sync().catch(capture);
      } catch (e) {
        capture(e);
        if (mounted) setError(userMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
      if (state.isConnected) void sync().catch(capture);
    });
    if (AppState.currentState === "active") supabase?.auth.startAutoRefresh();
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        supabase?.auth.startAutoRefresh();
        if (current.current)
          void recoverRecording(current.current.userId).catch(capture);
        void refresh()
          .then(() => sync())
          .catch(capture);
      } else supabase?.auth.stopAutoRefresh();
    });
    const authTimers = new Set<ReturnType<typeof setTimeout>>();
    let authEventRevision = 0;
    const auth = supabase?.auth.onAuthStateChange((event, authSession) => {
      const eventRevision = ++authEventRevision;
      // Leave the auth callback before calling APIs that may acquire the auth lock.
      const timer = setTimeout(() => {
        authTimers.delete(timer);
        if (!mounted || eventRevision !== authEventRevision) return;
        if (event === "SIGNED_OUT" && !current.current?.local) {
          void load(null).catch(capture);
          void database.remove("session").catch(capture);
        }
        if (event === "TOKEN_REFRESHED" && authSession)
          void sync().catch(capture);
      }, 0);
      authTimers.add(timer);
    });
    return () => {
      mounted = false;
      unsubscribe();
      app.remove();
      auth?.data.subscription.unsubscribe();
      authTimers.forEach(clearTimeout);
      supabase?.auth.stopAutoRefresh();
    };
  }, [initialize, load, refresh, sync]);
  useEffect(() => {
    if (!session || session.local || !supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel("community:" + session.userId);
    for (const table of ["published_activities", "comments", "reactions"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void sync().catch(capture);
          }, 750);
        },
      );
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase?.removeChannel(channel);
    };
  }, [session?.userId, session?.local, sync]);
  async function setUser(s: Session, p: Profile) {
    await database.set("session", s);
    await database.set("profile:" + s.userId, p);
    await load(s);
  }
  function acceptCloudUser(user: User, name?: string): Promise<void> {
    if (cloudAcceptance.current?.id === user.id)
      return cloudAcceptance.current.task;
    const task = hydrateCloudUser(user, name);
    cloudAcceptance.current = { id: user.id, task };
    void task
      .finally(() => {
        if (cloudAcceptance.current?.task === task)
          cloudAcceptance.current = null;
      })
      .catch(() => {});
    return task;
  }
  async function hydrateCloudUser(user: User, name?: string) {
    if (!supabase)
      throw new AppFailure("auth", "Cloud sign-in is unavailable.");
    const signedIn = {
      userId: user.id,
      email: user.email ?? "",
      demo: false,
      local: false,
    };
    if (await deletionPending(signedIn)) {
      await cleanupAccount(signedIn);
      throw new AppFailure("auth", "This account is queued for deletion.");
    }
    const [identity, settings] = await Promise.all([
      supabase
        .from("profiles")
        .select("name,handle,bio")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("athlete_settings")
        .select("settings")
        .eq("owner_id", user.id)
        .maybeSingle(),
    ]);
    if (identity.error) throw identity.error;
    if (settings.error) throw settings.error;
    const initial = defaultProfile(
      user.id,
      name ??
        user.user_metadata.name ??
        user.user_metadata.full_name ??
        "Athlete",
    );
    initial.handle = initial.handle.slice(0, 20) + "." + user.id.slice(0, 8);
    const p = profileInput({
      ...initial,
      ...(await database.get<Profile>("profile:" + user.id)),
      ...settings.data?.settings,
      ...identity.data,
      id: user.id,
      demo: false,
    });
    if (!identity.data) {
      const { error } = await supabase
        .from("profiles")
        .insert({ id: user.id, name: p.name, handle: p.handle });
      if (error) throw error;
    }
    await setUser(signedIn, p);
    void sync().catch(capture);
  }
  async function authenticateProvider(provider: SignInProvider) {
    const user = await beginProviderSignIn(provider);
    if (user) await acceptCloudUser(user);
  }
  async function completeProviderSignIn(code: string) {
    await acceptCloudUser(await finishProviderSignIn(code));
  }
  async function completePasswordRecovery(code: string, password: string) {
    // The recovery email returns here only for the account that requested
    // it; hydrating that user signs this device in as them.
    await acceptCloudUser(await finishPasswordRecovery(code, password));
  }
  async function authenticate(
    email: string,
    password: string,
    name?: string,
    accountMode: "device" | "cloud" = "device",
  ) {
    if (configurationError) throw configurationError;
    email = emailInput(email);
    password = passwordInput(password, name !== undefined);
    if (name !== undefined) name = textInput(name, "Name", 100);
    if (accountMode === "cloud") {
      if (!supabase)
        throw new AppFailure("auth", "Cloud accounts are not connected yet.");
      const result = name
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name },
              emailRedirectTo: "rivl://auth-callback",
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session)
        return "Check your email to confirm your account, then sign in.";
      await acceptCloudUser(result.data.session.user, name);
      return;
    }
    const key = "local-auth:" + email.toLowerCase(),
      existing = await database.get<{ id: string; salt: string; hash: string }>(
        key,
      );
    if (name) {
      if (existing)
        throw new AppFailure(
          "validation",
          "A local account already uses this email. Sign in instead.",
        );
      const salt = Crypto.randomUUID(),
        id = Crypto.randomUUID(),
        hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          salt + password,
        );
      await database.set(key, { id, salt, hash });
      await setUser(
        { userId: id, email, demo: false, local: true },
        defaultProfile(id, name),
      );
    } else {
      if (
        !existing ||
        (await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          existing.salt + password,
        )) !== existing.hash
      )
        throw new AppFailure(
          "validation",
          "Email or password does not match this device account.",
        );
      await setUser(
        { userId: existing.id, email, demo: false, local: true },
        (await database.get<Profile>("profile:" + existing.id)) ??
          defaultProfile(existing.id),
      );
    }
  }
  async function signOut() {
    if (await database.get("recording:active"))
      throw new AppFailure(
        "validation",
        "Save or discard your recording before signing out.",
      );
    if (!session?.local && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    await connectWatch(null).catch(() => {});
    await import("../services/sensors")
      .then((m) => m.disconnectAllSensors())
      .catch(() => {});
    await database.remove("session");
    await load(null);
  }
  async function deleteNow(
    reauthenticate: (owner: Session) => Promise<"completed" | "requested">,
  ) {
    const owner = current.current;
    if (!owner) throw new AppFailure("auth", "Sign in to delete your account.");
    if (await engine.active())
      throw new AppFailure(
        "validation",
        "Save or discard your current workout before deleting your account.",
      );
    if (syncing.current) await syncing.current.catch(capture);
    const state = await reauthenticate(owner);
    await cleanupAccount(owner);
    return state;
  }
  async function deleteAccount(password: string) {
    return deleteNow((owner) => requestDeletion(owner, password));
  }
  async function requestDeletionCode() {
    const owner = current.current;
    if (!owner) throw new AppFailure("auth", "Sign in to delete your account.");
    await sendCode(owner);
  }
  async function deleteAccountWithCode(code: string) {
    return deleteNow((owner) => requestDeletionWithCode(owner, code));
  }
  async function deletionNeedsPassword() {
    const owner = current.current;
    if (!owner) throw new AppFailure("auth", "Sign in to delete your account.");
    return await passwordDeletionAvailable(owner);
  }
  async function updateProfile(p: Partial<Profile>) {
    if (!profile) return;
    const next = profileInput({ ...profile, ...p, id: profile.id });
    if (supabase && !session?.local) {
      const { error } = await supabase
        .from("profiles")
        .update({ name: next.name, handle: next.handle, bio: next.bio })
        .eq("id", next.id);
      if (error) throw error;
      if (p.privacyZones) {
        const { error: privacyError } = await supabase.rpc(
          "set_privacy_zones",
          { p_zones: next.privacyZones },
        );
        if (privacyError)
          throw new AppFailure(
            "validation",
            "Privacy zones could not be updated in the cloud. Reconnect and try again.",
          );
      }
      const { error: settingsError } = await supabase
        .from("athlete_settings")
        .upsert({
          owner_id: next.id,
          settings: next,
          updated_at: new Date().toISOString(),
        });
      if (settingsError) throw settingsError;
    }
    await database.set("profile:" + profile.id, next);
    if (p.privacyZones) await trackRepository.deletePrevious(next.id);
    setProfile(next);
  }
  function writeActivity(work: () => Promise<void>) {
    const next = activityWrites.current.then(work);
    activityWrites.current = next.catch(() => {});
    return next;
  }
  function saveActivity(a: Activity) {
    return writeActivity(() => persistActivity(a));
  }
  function editActivity(id: string, revision: number, patch: ActivityEdit) {
    return writeActivity(async () => {
      const owner = current.current?.userId;
      if (!owner) throw new AppFailure("auth", "Sign in to edit an activity.");
      const activity = await database.get<Activity>(
        "activity:" + owner + ":" + id,
      );
      if (!activity)
        throw new AppFailure(
          "validation",
          "This activity is no longer available.",
        );
      await persistActivity(
        editActivityMetadata(activity, owner, revision, patch),
      );
    });
  }
  async function persistActivity(a: Activity) {
    const owner = current.current;
    if (!owner || a.ownerId !== owner.userId)
      throw new AppFailure(
        "forbidden",
        "This activity belongs to another athlete.",
      );
    const existing = await database.get<Activity>(
      "activity:" + owner.userId + ":" + a.id,
    );
    if (
      existing &&
      (a.revision < existing.revision ||
        (a.revision === existing.revision &&
          JSON.stringify({ ...a, sync: undefined }) !==
            JSON.stringify({ ...existing, sync: undefined })))
    )
      throw new AppFailure(
        "validation",
        "This activity changed. Reopen it before saving.",
      );
    if (current.current?.userId !== owner.userId)
      throw new AppFailure("auth", "Sign in again before saving.");
    if (!["private", "friends", "public"].includes(a.visibility))
      throw new AppFailure("validation", "Choose a valid activity visibility.");
    const saved = {
      ...a,
      title: textInput(a.title, "Activity title", 200),
      note: textInput(a.note, "Activity note", 10000, false),
      rpe: numeric(a.rpe, "Perceived effort", 1, 10),
      sync:
        owner.local || a.demo || a.simulated
          ? ("local" as const)
          : ("pending" as const),
    };
    let contribution: Record<string, unknown> = {};
    const prior = (await trackRepository.list(owner.userId)).find(
      (item) => item.activityId === saved.id,
    );
    if (
      prior &&
      saved.revision > prior.sourceRevision &&
      profile?.id === owner.userId
    ) {
      const prepared = prepareTrackEvidence(
        saved,
        await database.samples(saved.id),
        owner.userId,
        prior.origin,
        profile.privacyZones,
      );
      if (prepared.evidence)
        contribution = await trackRepository.prepareUpdateForCommit(
          owner.userId,
          prepared.evidence,
        );
      else await trackRepository.withdraw(owner.userId, saved.id);
    }
    if (owner.local || a.demo || a.simulated)
      await database.commit({
        ["activity:" + a.ownerId + ":" + a.id]: saved,
        ...contribution,
      });
    else await syncEngine.enqueue(saved, contribution);
    await refresh();
    if (online) void sync().catch(capture);
  }
  async function react(id: string) {
    if (!session) return;
    const p = posts.find((p) => p.id === id);
    if (!p) return;
    if (!session.local && !supabase)
      throw new AppFailure("offline", "Community is not configured.", true);
    if (!session.local && supabase) {
      const token = await cloudAccessToken(session.userId);
      const request = p.reactions.includes(session.userId)
        ? supabase
            .from("reactions")
            .delete()
            .eq("activity_id", id)
            .eq("athlete_id", session.userId)
        : supabase
            .from("reactions")
            .upsert(
              { activity_id: id, athlete_id: session.userId },
              { ignoreDuplicates: true },
            );
      const result = await request.setHeader(
        "Authorization",
        `Bearer ${token}`,
      );
      if (result.error) throw result.error;
      await assertCurrentCloudUser(session.userId);
      if (current.current?.userId !== session.userId) return;
    }
    const next = {
      ...p,
      reactionCount: Math.max(
        0,
        (p.reactionCount ?? p.reactions.length) +
          (p.reactions.includes(session.userId) ? -1 : 1),
      ),
      reactions: p.reactions.includes(session.userId)
        ? p.reactions.filter((x) => x !== session.userId)
        : [...p.reactions, session.userId],
    };
    await database.set("post:" + session.userId + ":" + id, next);
    setPosts(posts.map((p) => (p.id === id ? next : p)));
  }
  async function comment(id: string, text: string) {
    if (!session || !profile) return;
    text = textInput(text, "Comment", 2000);
    const p = posts.find((p) => p.id === id);
    if (!p) return;
    if (!session.local && !supabase)
      throw new AppFailure("offline", "Community is not configured.", true);
    const commentId = Crypto.randomUUID();
    if (!session.local && supabase) {
      const token = await cloudAccessToken(session.userId);
      const { error } = await supabase
        .from("comments")
        .insert({
          id: commentId,
          activity_id: id,
          athlete_id: session.userId,
          body: text,
        })
        .setHeader("Authorization", `Bearer ${token}`);
      if (error) throw error;
      await assertCurrentCloudUser(session.userId);
      if (current.current?.userId !== session.userId) return;
    }
    const next = {
      ...p,
      commentCount: (p.commentCount ?? p.comments.length) + 1,
      comments: [
        ...(session.local ? p.comments : p.comments.slice(-19)),
        {
          id: commentId,
          author: profile.name,
          authorId: session.userId,
          text: text,
          at: Date.now(),
        },
      ],
    };
    await database.set("post:" + session.userId + ":" + id, next);
    setPosts(posts.map((p) => (p.id === id ? next : p)));
  }
  async function saveRoute(r: RoutePlan) {
    const owner = current.current;
    if (!owner) throw new AppFailure("auth", "Sign in to save a route.");
    r = {
      ...r,
      name: textInput(r.name, "Route name", 200),
      surface: textInput(r.surface, "Surface", 200, false),
    };
    numeric(r.distance, "Route distance", 0, 10000000);
    numeric(r.ascent, "Route ascent", 0, 100000);
    if (!Array.isArray(r.points) || r.points.length > 300000)
      throw new AppFailure("validation", "This route is too large.");
    for (const point of r.points) {
      numeric(point.lat, "Latitude", -90, 90);
      numeric(point.lng, "Longitude", -180, 180);
    }
    if (!["run", "ride", "walk", "hike"].includes(r.sport))
      throw new AppFailure("validation", "Choose a supported sport.");
    if (r.routing && !["manual", "paths", "recorded"].includes(r.routing))
      throw new AppFailure("validation", "Choose a valid route type.");
    if (r.waypoints) r.waypoints = waypointList(r.waypoints);
    await routeRepository.save(owner.userId, r, owner.local);
    if (current.current?.userId === owner.userId)
      setRoutes((existing) => [
        r,
        ...existing.filter((route) => route.id !== r.id),
      ]);
    if (online) void sync().catch(capture);
  }
  async function deleteRoute(id: string) {
    const owner = current.current;
    if (!owner) throw new AppFailure("auth", "Sign in to delete a route.");
    await routeRepository.delete(owner.userId, id, owner.local);
    if (current.current?.userId === owner.userId)
      setRoutes((existing) => existing.filter((route) => route.id !== id));
    if (online) void sync().catch(capture);
  }
  async function join(c: Challenge) {
    if (!session) return;
    if (!session.local && supabase) {
      const result = c.joined
        ? await supabase
            .from("challenge_members")
            .delete()
            .eq("challenge_id", c.id)
            .eq("athlete_id", session.userId)
        : await supabase
            .from("challenge_members")
            .upsert({ challenge_id: c.id, athlete_id: session.userId });
      if (result.error) throw result.error;
    }
    await database.set("challenge:" + session.userId + ":" + c.id, {
      ...c,
      joined: !c.joined,
    });
    setChallenges((existing) =>
      existing.map((item) =>
        item.id === c.id ? { ...c, joined: !c.joined } : item,
      ),
    );
  }
  return (
    <Context.Provider
      value={{
        loading,
        error,
        session,
        profile,
        activities,
        posts,
        routes,
        challenges,
        segments,
        efforts,
        online,
        communityError,
        trackMappingError:
          trackMappingFailure && trackMappingFailure.owner === session?.userId
            ? trackMappingFailure.message
            : null,
        refresh,
        authenticate,
        authenticateProvider,
        completeProviderSignIn,
        beginPasswordRecovery,
        completePasswordRecovery,
        signOut,
        deleteAccount,
        requestDeletionCode,
        deleteAccountWithCode,
        deletionNeedsPassword,
        updateProfile,
        saveActivity,
        editActivity,
        sync,
        react,
        comment,
        saveRoute,
        deleteRoute,
        join,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const context = useContext(Context);
  if (!context) throw new AppFailure("validation", "StoreProvider is missing.");
  return context;
}

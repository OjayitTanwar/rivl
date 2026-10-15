import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  AppState,
  Linking,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import {
  ArrowLeft,
  ChevronDown,
  Search,
  Undo2,
  ArrowDownUp,
  MoreHorizontal,
  X,
  Trash2,
  LocateFixed,
} from "lucide-react-native";
import * as Crypto from "expo-crypto";
import { useStore } from "../src/state/store";
import { database } from "../src/storage/database";
import {
  appendWaypoint,
  coordinate,
  directLine,
  type RouteDraft,
} from "../src/domain/route-planning";
import type { Coordinate, Sport } from "../src/domain/types";
import {
  loadPathNetwork,
  type PathNetwork,
} from "../src/services/path-network";
import { routeProvider } from "../src/services/route-planning";
import { plannerLocation, searchPlace } from "../src/services/route-location";
import { userMessage } from "../src/security/errors";
import { km } from "../src/domain/format";
import {
  Screen,
  Button,
  Field,
  Row,
  Txt,
  Segmented,
  Notice,
  Stack,
  IconButton,
} from "../src/ui/primitives";
import RouteMap from "../src/ui/RouteMap";
import { LoadingJourney } from "../src/ui/LoadingJourney";
import { useTheme } from "../src/ui/theme";

const sports: { value: Sport; label: string }[] = [
  { value: "run", label: "Run" },
  { value: "ride", label: "Ride" },
  { value: "walk", label: "Walk" },
  { value: "hike", label: "Hike" },
];
const empty = (sport: Sport = "run"): RouteDraft => ({
  name: "",
  sport,
  waypoints: [],
  line: directLine([]),
});

export default function RoutePlanner() {
  const params = useLocalSearchParams<{
    id?: string;
    lat?: string;
    lng?: string;
    sport?: string;
  }>();
  const id = typeof params.id === "string" ? params.id : undefined;
  const requestedSport =
    sports.find((item) => item.value === params.sport)?.value ?? "run";
  let requestedCenter: Coordinate | undefined;
  if (
    typeof params.lat === "string" &&
    typeof params.lng === "string" &&
    params.lat.trim() &&
    params.lng.trim()
  ) {
    try {
      requestedCenter = coordinate({
        lat: Number(params.lat),
        lng: Number(params.lng),
      });
    } catch {}
  }
  const { profile, routes, saveRoute, deleteRoute } = useStore();
  const original = routes.find((route) => route.id === id);
  const { c } = useTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset =
    height > width
      ? Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0)
      : insets.top;
  const [mapHeight, setMapHeight] = useState(Math.max(200, height * 0.55));
  const [panel, setPanel] = useState<
    "stops" | "save" | "sport" | "more" | null
  >(null);
  const [movingStop, setMovingStop] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<
    Pick<RouteDraft, "waypoints" | "line">[]
  >([]);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const locationRevision = useRef(0);
  const searchRevision = useRef(0);
  const [draft, setDraft] = useState<RouteDraft>(() => empty(requestedSport));
  const [ready, setReady] = useState(false);
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Coordinate[]>([]);
  const [center, setCenter] = useState<Coordinate>();
  const [network, setNetwork] = useState<PathNetwork | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const networkRequest = useRef<AbortController | null>(null);
  const networkCenter = center ?? draft.waypoints[0];
  useEffect(() => {
    networkRequest.current?.abort();
    setNetwork(null);
    setNetworkError(null);
    setNetworkBusy(false);
    return () => networkRequest.current?.abort();
  }, [networkCenter?.lat, networkCenter?.lng, draft.sport, profile?.id]);
  async function showNetwork() {
    if (!networkCenter) return;
    networkRequest.current?.abort();
    const request = new AbortController();
    networkRequest.current = request;
    setNetworkBusy(true);
    setNetworkError(null);
    try {
      const result = await loadPathNetwork(
        networkCenter,
        draft.sport,
        request.signal,
      );
      if (!request.signal.aborted) setNetwork(result);
    } catch (error) {
      if (!request.signal.aborted) setNetworkError(userMessage(error));
    } finally {
      if (!request.signal.aborted) setNetworkBusy(false);
    }
  }
  const [finding, setFinding] = useState(false);
  const [searching, setSearching] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const writes = useRef(Promise.resolve());
  const saved = useRef(false);
  const newRouteId = useRef(Crypto.randomUUID());
  const currentOwner = useRef(profile?.id);
  currentOwner.current = profile?.id;
  const latestDraft = useRef<RouteDraft | null>(null);
  const latestDraftKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const draftKey = profile ? `route-draft:${profile.id}:${id ?? "new"}` : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!draftKey) return;
    let active = true;
    setReady(false);
    setLoadedDraftKey(null);
    setError(null);
    saved.current = false;
    latestDraft.current = null;
    latestDraftKey.current = null;
    revision.current++;
    locationRevision.current++;
    searchRevision.current++;
    controller.current?.abort();
    setFinding(false);
    setSearching(false);
    setUndoStack([]);
    setMovingStop(null);
    setResults([]);
    setPanel(null);
    setCenter(undefined);
    setLocationMessage(null);
    setLocating(false);
    void database
      .get<RouteDraft>(draftKey)
      .then((cached) => {
        if (!active) return;
        const initial =
          cached ??
          (original
            ? {
                name: original.name,
                sport: original.sport,
                waypoints: original.waypoints?.length
                  ? original.waypoints
                  : [
                      original.points[0],
                      original.points[original.points.length - 1],
                    ]
                      .filter((p): p is NonNullable<typeof p> => !!p)
                      .map(({ lat, lng }) => ({ lat, lng })),
                line: {
                  points: original.points,
                  distance: original.distance,
                  kind: original.routing ?? "recorded",
                },
              }
            : empty(requestedSport));
        setDraft(initial);
        latestDraftKey.current = draftKey;
        setLoadedDraftKey(draftKey);
        if (!initial.line.points.length && !initial.waypoints.length) {
          if (requestedCenter) setCenter(requestedCenter);
          else {
            const requestRevision = ++locationRevision.current;
            setLocating(true);
            setLocationMessage(null);
            void plannerLocation()
              .then((point) => {
                if (active && requestRevision === locationRevision.current)
                  setCenter(point);
              })
              .catch((e) => {
                if (active && requestRevision === locationRevision.current)
                  setLocationMessage(userMessage(e));
              })
              .finally(() => {
                if (active && requestRevision === locationRevision.current)
                  setLocating(false);
              });
          }
        }
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(userMessage(e));
      });
    return () => {
      active = false;
      locationRevision.current++;
      searchRevision.current++;
      revision.current++;
      controller.current?.abort();
    };
  }, [draftKey, loadAttempt]);
  useEffect(() => {
    if (!ready || !draftKey || loadedDraftKey !== draftKey || saved.current)
      return;
    latestDraft.current = draft;
    const timer = setTimeout(() => persistDraft(draftKey), 350);
    return () => clearTimeout(timer);
  }, [draft, ready, draftKey, loadedDraftKey]);
  useEffect(() => {
    if (!draftKey) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") persistDraft(draftKey);
    });
    return () => {
      subscription.remove();
      persistDraft(draftKey);
    };
  }, [draftKey]);
  function persistDraft(key: string) {
    const current = latestDraft.current;
    if (
      !current ||
      key !== latestDraftKey.current ||
      saved.current ||
      !currentOwner.current ||
      !key.startsWith(`route-draft:${currentOwner.current}:`)
    )
      return;
    writes.current = writes.current
      .catch(() => {})
      .then(() => database.set(key, current));
    void writes.current.catch((e) => {
      if (mounted.current) setError(userMessage(e));
    });
  }

  function changeStops(stops: Coordinate[]) {
    const line = directLine(stops);
    setUndoStack((history) => [
      ...history.slice(-23),
      { waypoints: draft.waypoints, line: draft.line },
    ]);
    revision.current++;
    controller.current?.abort();
    setFinding(false);
    setDraft((current) => ({ ...current, waypoints: stops, line }));
    setError(null);
  }
  function add(point: Coordinate) {
    try {
      if (movingStop !== null) {
        changeStops(
          draft.waypoints.map((stop, index) =>
            index === movingStop ? coordinate(point) : stop,
          ),
        );
        setMovingStop(null);
      } else changeStops(appendWaypoint(draft.waypoints, point));
      Keyboard.dismiss();
    } catch (e) {
      setError(userMessage(e));
    }
  }
  async function findPaths() {
    setError(null);
    if (finding || draft.waypoints.length < 2) return;
    const currentRevision = revision.current;
    const requestOwner = profile?.id;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setFinding(true);
    try {
      const line = await routeProvider.route(
        draft.waypoints,
        draft.sport,
        request.signal,
      );
      if (
        mounted.current &&
        revision.current === currentRevision &&
        currentOwner.current === requestOwner &&
        !request.signal.aborted
      )
        setDraft((current) => ({ ...current, line }));
    } catch (e) {
      if (mounted.current && !request.signal.aborted) setError(userMessage(e));
    } finally {
      if (mounted.current && controller.current === request) setFinding(false);
    }
  }
  async function search() {
    if (searching || !query.trim()) return;
    Keyboard.dismiss();
    const requestRevision = ++searchRevision.current;
    locationRevision.current++;
    setLocating(false);
    setSearching(true);
    setResults([]);
    setError(null);
    try {
      const found = await searchPlace(query);
      if (!mounted.current || requestRevision !== searchRevision.current)
        return;
      setResults(found);
      if (found[0]) {
        setCenter(found[0]);
        setRecenterKey((key) => key + 1);
        setLocationMessage(null);
      } else
        setError(
          "No place found. Try a more specific address, or enter latitude, longitude.",
        );
    } catch (e) {
      if (mounted.current && requestRevision === searchRevision.current)
        setError(userMessage(e));
    } finally {
      if (mounted.current && requestRevision === searchRevision.current)
        setSearching(false);
    }
  }
  async function locate() {
    const requestRevision = ++locationRevision.current;
    setLocating(true);
    setLocationMessage(null);
    try {
      const point = await plannerLocation();
      if (!mounted.current || requestRevision !== locationRevision.current)
        return;
      setCenter(point);
      setRecenterKey((key) => key + 1);
    } catch (e) {
      if (mounted.current && requestRevision === locationRevision.current)
        setLocationMessage(userMessage(e));
    } finally {
      if (mounted.current && requestRevision === locationRevision.current)
        setLocating(false);
    }
  }
  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    revision.current++;
    controller.current?.abort();
    setFinding(false);
    setMovingStop(null);
    setDraft((current) => ({ ...current, ...previous }));
    setUndoStack((history) => history.slice(0, -1));
    setError(null);
  }
  function changeSport(sport: Sport) {
    if (sport !== draft.sport) {
      revision.current++;
      controller.current?.abort();
      setFinding(false);
      setMovingStop(null);
      setUndoStack([]);
      setDraft((current) => ({
        ...current,
        sport,
        line: directLine(current.waypoints),
      }));
    }
    setPanel(null);
  }
  async function save() {
    if (!profile || !draftKey || currentOwner.current !== profile.id)
      throw new Error("Sign in to save a route.");
    const requestOwner = profile.id;
    await saveRoute({
      id: original?.id ?? newRouteId.current,
      name: draft.name,
      sport: draft.sport,
      points: draft.line.points,
      distance: draft.line.distance,
      ascent: draft.line.kind === "recorded" ? (original?.ascent ?? 0) : 0,
      surface:
        draft.line.kind === "manual"
          ? "Direct line · paths not verified"
          : draft.line.kind === "paths"
            ? "Mapped roads and paths · surface varies"
            : (original?.surface ?? "Recorded route"),
      saved: true,
      waypoints: draft.waypoints,
      routing: draft.line.kind,
    });
    if (
      !mounted.current ||
      currentOwner.current !== requestOwner ||
      latestDraftKey.current !== draftKey
    )
      return;
    saved.current = true;
    await writes.current.catch(() => {});
    await database.remove(draftKey);
    router.replace("/routes");
  }
  function remove() {
    if (!original) return;
    const requestOwner = profile?.id;
    const requestDraftKey = draftKey;
    Alert.alert(
      "Delete this route?",
      "Your recorded workouts will remain in your history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete route",
          style: "destructive",
          onPress: () => {
            if (
              currentOwner.current !== requestOwner ||
              latestDraftKey.current !== requestDraftKey
            )
              return;
            void (async () => {
              await deleteRoute(original.id);
              if (
                !mounted.current ||
                currentOwner.current !== requestOwner ||
                latestDraftKey.current !== requestDraftKey
              )
                return;
              saved.current = true;
              await writes.current.catch(() => {});
              if (draftKey) await database.remove(draftKey);
              router.replace("/routes");
            })().catch((e) => setError(userMessage(e)));
          },
        },
      ],
    );
  }

  if (!profile)
    return (
      <Screen title="Plan a route" back>
        <Notice text="Sign in to create and save a route." />
        <Button title="Sign in" onPress={() => router.push("/auth")} />
      </Screen>
    );
  if (!ready || loadedDraftKey !== draftKey)
    return (
      <Screen title="Plan a route" back>
        {error ? (
          <Notice
            text={error}
            retry={() => {
              setError(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          />
        ) : (
          <LoadingJourney fullScreen label="Opening your route…" />
        )}
      </Screen>
    );
  const routeStatus =
    draft.line.kind === "paths"
      ? "Following mapped paths"
      : draft.line.kind === "recorded"
        ? "Recorded route"
        : "Direct line · unverified";
  const togglePanel = (next: typeof panel) => {
    Keyboard.dismiss();
    setPanel((current) => (current === next ? null : next));
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={[]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Stack
          gap={8}
          style={{
            paddingTop: topInset + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            backgroundColor: c.surface,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Row style={{ gap: 8 }}>
            <IconButton
              label="Back"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/maps")
              }
            >
              <ArrowLeft size={23} color={c.text} />
            </IconButton>
            <Txt accessibilityRole="header" weight="700" style={{ flex: 1 }}>
              {original ? "Edit route" : "Plan a route"}
            </Txt>
            <Button
              title={sports.find((sport) => sport.value === draft.sport)!.label}
              variant="quiet"
              icon={<ChevronDown size={17} color={c.text} />}
              onPress={() => togglePanel("sport")}
              style={{
                minHeight: 44,
                paddingVertical: 8,
                paddingHorizontal: 8,
              }}
            />
          </Row>
          <Field
            label="Find a place"
            hideLabel
            leading={<Search size={19} color={c.muted} />}
            testID="planner-search"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setResults([]);
            }}
            placeholder="Search an address or coordinates"
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            maxLength={200}
            trailing={
              <Button
                title="Search"
                variant="quiet"
                loading={searching}
                disabled={!query.trim()}
                onPress={search}
                style={{
                  minHeight: 44,
                  paddingVertical: 8,
                  paddingHorizontal: 4,
                }}
              />
            }
          />
        </Stack>
        <View
          style={{ flex: 1, minHeight: 120, overflow: "hidden" }}
          onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}
        >
          <RouteMap
            unverified={draft.line.kind === "manual"}
            network={network?.lines}
            points={draft.line.points}
            waypoints={draft.waypoints}
            center={center}
            onMapPress={add}
            height={mapHeight}
            borderRadius={0}
            autoFit
            onLocate={() => void locate()}
            recenterKey={recenterKey}
          />
          {!center && !draft.line.points.length && !draft.waypoints.length && (
            <Stack
              gap={12}
              style={{
                position: "absolute",
                top: 0,
                right: 48,
                bottom: 0,
                left: 16,
                justifyContent: "center",
                padding: 16,
              }}
            >
              <Txt size="heading" weight="700">
                Choose where to start
              </Txt>
              {locating ? (
                <LoadingJourney
                  fullScreen
                  compact
                  label="Finding your starting point…"
                />
              ) : (
                <Txt color={c.muted}>
                  {locationMessage ||
                    "Search for a place, or centre the map on your location."}
                </Txt>
              )}
              {!locating && (
                <Button
                  title="Locate me"
                  variant="secondary"
                  icon={<LocateFixed size={18} color={c.text} />}
                  loading={locating}
                  onPress={locate}
                  style={{ alignSelf: "flex-start" }}
                />
              )}
            </Stack>
          )}
          {!!results.length && (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{
                position: "absolute",
                top: 0,
                left: 16,
                right: 16,
                maxHeight: Math.min(220, mapHeight - 20),
                backgroundColor: c.surface,
                borderRadius: 8,
              }}
              contentContainerStyle={{ padding: 12, gap: 4 }}
            >
              <Row between>
                <Txt size="caption" color={c.muted}>
                  Add a search result as a stop
                </Txt>
                <IconButton
                  label="Dismiss search results"
                  onPress={() => setResults([])}
                >
                  <X size={18} color={c.text} />
                </IconButton>
              </Row>
              {results.map((point, index) => (
                <Button
                  key={`${point.lat}:${point.lng}:${index}`}
                  title={`${movingStop !== null ? "Move stop" : "Add stop"} · ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}
                  variant="quiet"
                  onPress={() => {
                    add(point);
                    setResults([]);
                  }}
                  style={{ justifyContent: "flex-start", paddingHorizontal: 4 }}
                />
              ))}
            </ScrollView>
          )}
          {searching && (
            <View
              style={{
                position: "absolute",
                top: 12,
                left: 16,
                right: 64,
                backgroundColor: c.surface,
                borderRadius: 8,
              }}
            >
              <LoadingJourney compact label="Finding that place…" />
            </View>
          )}
          {movingStop !== null && !results.length && (
            <Row
              between
              style={{
                position: "absolute",
                left: 16,
                right: 64,
                top: 12,
                backgroundColor: c.surface,
                paddingLeft: 12,
                borderRadius: 8,
              }}
            >
              <Txt size="caption" style={{ flex: 1 }}>
                Tap to move stop {movingStop + 1}
              </Txt>
              <IconButton
                label="Cancel moving stop"
                onPress={() => setMovingStop(null)}
              >
                <X size={18} color={c.text} />
              </IconButton>
            </Row>
          )}
          {network && !results.length && movingStop === null && (
            <Txt
              size="caption"
              style={{
                position: "absolute",
                left: 12,
                bottom: 24,
                backgroundColor: c.surface,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              Blue dashes: mapped paths
            </Txt>
          )}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{
            flexGrow: 0,
            maxHeight: Math.max(210, height * 0.48),
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(12, insets.bottom),
            gap: 8,
          }}
        >
          <Row between style={{ alignItems: "flex-start" }}>
            <Stack gap={2} style={{ flex: 1 }}>
              <Txt size="heading" mono weight="700">
                {km(draft.line.distance)}{" "}
                <Txt size="caption" color={c.muted}>
                  km
                </Txt>
              </Txt>
              <Txt
                size="caption"
                color={
                  draft.waypoints.length > 1 && draft.line.kind === "manual"
                    ? c.accent
                    : c.muted
                }
              >
                {draft.waypoints.length
                  ? routeStatus
                  : "Tap the map to add your starting point"}
              </Txt>
            </Stack>
            <Button
              title={`${draft.waypoints.length} stops`}
              variant="quiet"
              icon={<ChevronDown size={16} color={c.text} />}
              onPress={() => togglePanel("stops")}
              style={{
                minHeight: 44,
                paddingHorizontal: 8,
                paddingVertical: 8,
              }}
            />
          </Row>
          <Row style={{ gap: 8 }}>
            <Button
              title="Undo"
              variant="quiet"
              icon={<Undo2 size={17} color={c.text} />}
              disabled={!undoStack.length}
              onPress={undo}
              style={{
                minHeight: 44,
                paddingHorizontal: 8,
                paddingVertical: 8,
              }}
            />
            <Button
              title="Reverse"
              variant="quiet"
              icon={<ArrowDownUp size={17} color={c.text} />}
              disabled={draft.waypoints.length < 2}
              onPress={() => {
                changeStops([...draft.waypoints].reverse());
                setMovingStop(null);
              }}
              style={{
                minHeight: 44,
                paddingHorizontal: 8,
                paddingVertical: 8,
              }}
            />
            <View style={{ flex: 1 }} />
            <IconButton
              label="More route options"
              onPress={() => togglePanel("more")}
            >
              <MoreHorizontal size={22} color={c.text} />
            </IconButton>
          </Row>
          {!!error && <Notice text={error} />}
          {finding && (
            <LoadingJourney
              fullScreen
              compact
              label="Finding roads and paths…"
            />
          )}
          {networkBusy && (
            <LoadingJourney fullScreen label="Finding nearby paths…" />
          )}
          {!!locationMessage && !!center && (
            <Txt size="caption" color={c.muted}>
              {locationMessage}
            </Txt>
          )}
          {panel && (
            <Stack
              gap={12}
              style={{
                paddingTop: 12,
                paddingBottom: 12,
                borderTopWidth: 1,
                borderTopColor: c.line,
              }}
            >
              <Row between>
                <Txt weight="700">
                  {panel === "stops"
                    ? "Route stops"
                    : panel === "save"
                      ? "Save your route"
                      : panel === "sport"
                        ? "Choose your sport"
                        : "Route options"}
                </Txt>
                <IconButton
                  label="Close route details"
                  onPress={() => {
                    setPanel(null);
                    Keyboard.dismiss();
                  }}
                >
                  <X size={19} color={c.text} />
                </IconButton>
              </Row>
              {panel === "sport" && (
                <Segmented
                  options={sports}
                  value={draft.sport}
                  onChange={changeSport}
                />
              )}
              {panel === "stops" && (
                <Stack gap={0}>
                  {!draft.waypoints.length && (
                    <Txt color={c.muted}>
                      Tap the map or add a searched place to set your first
                      stop.
                    </Txt>
                  )}
                  {draft.waypoints.map((stop, index) => (
                    <Row
                      key={index}
                      style={{
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: c.line,
                        gap: 8,
                      }}
                    >
                      <Stack gap={2} style={{ flex: 1 }}>
                        <Txt weight="600">
                          Stop {index + 1}
                          {index === 0
                            ? " · Start"
                            : index === draft.waypoints.length - 1
                              ? " · Finish"
                              : ""}
                        </Txt>
                        <Txt size="caption" mono color={c.muted}>
                          {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                        </Txt>
                      </Stack>
                      <Button
                        title="Move"
                        variant="quiet"
                        onPress={() => {
                          setMovingStop(index);
                          setPanel(null);
                        }}
                        style={{
                          minHeight: 44,
                          paddingHorizontal: 8,
                          paddingVertical: 8,
                        }}
                      />
                      <IconButton
                        label={`Remove stop ${index + 1}`}
                        onPress={() => {
                          changeStops(
                            draft.waypoints.filter((_, i) => i !== index),
                          );
                          setMovingStop(null);
                        }}
                      >
                        <Trash2 size={18} color={c.muted} />
                      </IconButton>
                    </Row>
                  ))}
                  {draft.waypoints.length > 0 && (
                    <Button
                      title="Clear all stops"
                      variant="danger"
                      onPress={() => {
                        changeStops([]);
                        setMovingStop(null);
                      }}
                    />
                  )}
                  <Txt size="caption" color={c.muted}>
                    After editing stops, tap Find paths to follow mapped roads
                    and trails.
                  </Txt>
                </Stack>
              )}
              {panel === "save" && (
                <Stack gap={12}>
                  <Field
                    label="Route name"
                    testID="planner-name"
                    value={draft.name}
                    onChangeText={(name) =>
                      setDraft((current) => ({ ...current, name }))
                    }
                    placeholder="Name your route"
                    maxLength={200}
                    autoFocus
                    returnKeyType="done"
                  />
                  <Txt size="caption" color={c.muted}>
                    {draft.line.kind === "manual"
                      ? "Direct lines do not follow streets or trails. This route will be saved as an unverified reference."
                      : "Check access and conditions before heading out. Elevation is unavailable for planned routes."}
                  </Txt>
                  <Button
                    title={
                      draft.line.kind === "manual"
                        ? "Save direct route"
                        : "Save route"
                    }
                    testID="save-planned-route"
                    disabled={
                      finding ||
                      !draft.name.trim() ||
                      draft.line.points.length < 2
                    }
                    onPress={save}
                  />
                </Stack>
              )}
              {panel === "more" && (
                <Stack gap={12}>
                  <Button
                    testID="show-path-network"
                    title={
                      network
                        ? "Hide nearby paths"
                        : draft.sport === "ride"
                          ? "Show cycling paths nearby"
                          : "Show walking paths nearby"
                    }
                    variant="secondary"
                    disabled={!networkCenter}
                    loading={networkBusy}
                    onPress={() =>
                      network ? setNetwork(null) : void showNetwork()
                    }
                  />
                  <Txt size="caption" color={c.muted}>
                    {networkCenter
                      ? "Loads mapped paths within 1.2 km of your searched place or first stop. This area is sent to the free map service."
                      : "Search for a place or locate yourself to explore nearby paths."}
                  </Txt>
                  {networkError && (
                    <Notice
                      text={networkError}
                      retry={() => void showNetwork()}
                    />
                  )}
                  {network && (
                    <Txt size="caption" color={c.muted}>
                      {network.lines.length
                        ? "Blue dashes show mapped paths; coral shows your route."
                        : "No matching paths returned here. Try another place; mapping may be incomplete."}
                      {network.limited ? " Showing a limited selection." : ""}{" "}
                      Coverage and access can change. © OpenStreetMap
                      contributors.
                    </Txt>
                  )}
                  <Txt size="caption" color={c.muted}>
                    Drafts stay on this device. Find paths sends your stops to
                    the routing provider; address search uses your phone’s
                    geocoder.
                  </Txt>
                  <Button
                    title="Routing · FOSSGIS / OpenStreetMap"
                    variant="quiet"
                    onPress={() =>
                      Linking.openURL(
                        "https://routing.openstreetmap.de/about.html",
                      )
                    }
                  />
                  <Button
                    title="Fix the map"
                    variant="quiet"
                    onPress={() =>
                      Linking.openURL("https://www.openstreetmap.org/fixthemap")
                    }
                  />
                  {original && (
                    <Button
                      title="Delete route"
                      variant="danger"
                      onPress={remove}
                    />
                  )}
                </Stack>
              )}
            </Stack>
          )}
          {panel !== "save" && (
            <Row style={{ gap: 12 }}>
              <Button
                title="Find paths"
                variant="secondary"
                loading={finding}
                disabled={draft.waypoints.length < 2}
                onPress={findPaths}
                style={{ flex: 1 }}
              />
              <Button
                title="Save"
                disabled={finding || draft.line.points.length < 2}
                onPress={() => setPanel("save")}
                style={{ flex: 1 }}
              />
            </Row>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

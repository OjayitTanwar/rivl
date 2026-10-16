import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import { MapPin, Navigation2, RotateCcw, Check } from "lucide-react-native";
import { googleMapsUrl } from "../src/domain/google-maps";
import { navigationStops } from "../src/domain/navigation-stops";
import { offlineReroute } from "../src/domain/offline-routing";
import { upcomingInfrastructureWarning } from "../src/domain/infrastructure-warning";
import { config } from "../src/services/config";
import { km } from "../src/domain/format";
import { useLocalSearchParams } from "expo-router";
import type { Coordinate, Sample, Sport } from "../src/domain/types";
import {
  approachInstruction,
  navigationProgress,
  type GuidedRoute,
  type NavigationProgress,
} from "../src/domain/navigation";
import { routeProvider } from "../src/services/route-planning";
import {
  offlineAreaAt,
  savedOfflineGuide,
  type OfflineArea,
} from "../src/services/offline-maps";
import { distance } from "../src/domain/geo";
import {
  plannerLocation,
  searchPlace,
  suggestPlaces,
  type PlaceSuggestion,
} from "../src/services/route-location";
import {
  prepareNavigationVoice,
  speakNavigation,
  stopNavigationVoice,
} from "../src/services/navigation-voice";
import { loadPathNetwork } from "../src/services/path-network";
import { useStore } from "../src/state/store";
import RouteMap from "../src/ui/RouteMap";
import {
  Button,
  Card,
  Field,
  Notice,
  Row,
  Screen,
  Segmented,
  Txt,
} from "../src/ui/primitives";
import { useTheme } from "../src/ui/theme";
import { userMessage } from "../src/security/errors";

const modes = [
  { label: "Walk", value: "walk" as Sport },
  { label: "Run", value: "run" as Sport },
  { label: "Cycle", value: "ride" as Sport },
  { label: "Hike", value: "hike" as Sport },
];
export default function Navigate() {
  const params = useLocalSearchParams<{ route?: string }>();
  const { routes, profile } = useStore();
  const saved = routes.find((item) => item.id === params.route);
  const { c, reduceMotion } = useTheme();
  const [query, setQuery] = useState(saved?.name ?? "");
  const usingSaved = !!saved && query === saved.name;
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const [sport, setSport] = useState<Sport>(saved?.sport ?? "walk");
  const [route, setRoute] = useState<GuidedRoute | null>(null);
  const [choices, setChoices] = useState<GuidedRoute[]>([]);
  const [reverse, setReverse] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [detour, setDetour] = useState<Coordinate | null>(null);
  const [pickingDetour, setPickingDetour] = useState(false);
  const [offlineArea, setOfflineArea] = useState<OfflineArea | null>(null);
  const [position, setPosition] = useState<Coordinate | null>(null);
  const [progress, setProgress] = useState<NavigationProgress | null>(null);
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState(
    "Enter a destination to find a route from your current location.",
  );
  const watch = useRef<Location.LocationSubscription | null>(null);
  const currentRoute = useRef<GuidedRoute | null>(null);
  const destination = useRef<Coordinate | null>(null);
  const lastPrompt = useRef("");
  const offRouteCount = useRef(0);
  const lastReroute = useRef(0);
  const activeRef = useRef(false);
  const navigationRun = useRef(0);
  const mutedRef = useRef(false);
  const progressAlong = useRef(0);
  const pathNetwork = useRef<{
    center: Coordinate;
    lines: Sample[][];
    limited: boolean;
  } | null>(null);
  const pathNetworkLoading = useRef(false);
  const infrastructureBucket = useRef(-1);
  useEffect(() => {
    if (!active) {
      setRoute(null);
      setChoices([]);
      destination.current = null;
    }
  }, [query, sport, reverse, selectedPlace?.id, detour]);
  useEffect(() => {
    const term = query.trim();
    if (active || usingSaved || term.length < 3 || selectedPlace) {
      setSuggestions([]);
      setSearching(false);
      setSearchMessage("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchMessage("");
      void suggestPlaces(term, controller.signal)
        .then((places) => {
          if (controller.signal.aborted) return;
          setSuggestions(places);
          setSearchMessage(
            places.length ? "" : "No suggestions. Try a fuller place name.",
          );
          suggestionOpacity.setValue(reduceMotion ? 1 : 0);
          Animated.timing(suggestionOpacity, {
            toValue: 1,
            duration: reduceMotion ? 0 : 180,
            useNativeDriver: true,
          }).start();
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setSearchMessage(
              "Suggestions unavailable. You can still find a route.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    query,
    active,
    usingSaved,
    selectedPlace,
    reduceMotion,
    suggestionOpacity,
  ]);
  useEffect(
    () => () => {
      navigationRun.current++;
      activeRef.current = false;
      watch.current?.remove();
      stopNavigationVoice();
    },
    [],
  );
  useEffect(() => {
    void prepareNavigationVoice();
  }, []);

  async function stop() {
    navigationRun.current++;
    activeRef.current = false;
    watch.current?.remove();
    watch.current = null;
    stopNavigationVoice();
    setActive(false);
    setProgress(null);
    setNotice("Navigation stopped.");
  }
  async function plan() {
    const target =
      (usingSaved ? saved?.points.at(reverse ? 0 : -1) : undefined) ??
      selectedPlace?.coordinate ??
      (await searchPlace(query))[0];
    if (!target)
      throw new Error("No place found. Try a more specific address.");
    const here = await plannerLocation();
    const base = usingSaved
      ? navigationStops(here, saved, reverse)
      : [here, target];
    const stops = detour ? [base[0]!, detour, ...base.slice(1)] : base;
    destination.current = stops.at(-1)!;
    setPosition(here);
    const cached =
      profile && saved && usingSaved && !reverse && !detour
        ? await savedOfflineGuide(profile.id, saved)
        : null;
    const candidates =
      cached?.points[0] && distance(here, cached.points[0]) <= 150
        ? [cached]
        : await routeProvider.alternatives!(stops, sport);
    if (!candidates.length)
      throw new Error("No connected paths found. Try another destination.");
    if (profile) setOfflineArea(await offlineAreaAt(profile.id, here));
    setChoices(candidates);
    setRoute(candidates[0]!);
    setNotice(
      candidates.length > 1
        ? "Choose a route, then start guidance."
        : "Route ready. Check the map, then start guidance.",
    );
    return candidates[0]!;
  }
  async function preview() {
    setPlanning(true);
    setNotice("Finding connected paths…");
    try {
      await plan();
    } catch (error) {
      setNotice(userMessage(error));
    } finally {
      setPlanning(false);
    }
  }
  async function start() {
    await stop();
    const run = navigationRun.current;
    setPlanning(true);
    setNotice("Finding your position and route…");
    try {
      const result = route ?? (await plan());
      if (run !== navigationRun.current) return;
      const here = position ?? result.points[0]!;
      progressAlong.current = 0;
      lastPrompt.current = "";
      offRouteCount.current = 0;
      infrastructureBucket.current = -1;
      pathNetwork.current = null;
      currentRoute.current = result;
      setRoute(result);
      await prepareNavigationVoice();
      if (run !== navigationRun.current) return;
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 8,
          timeInterval: 2500,
        },
        (fix) => {
          void onPosition(fix);
        },
      );
      if (run !== navigationRun.current) {
        subscription.remove();
        return;
      }
      watch.current = subscription;
      activeRef.current = true;
      setActive(true);
      setNotice(
        "Guidance is active while this screen stays open. Follow local signs and traffic rules.",
      );
      if (!mutedRef.current)
        speakNavigation(
          "Route ready. Follow the map and local signs. Path and cycle-lane coverage may be incomplete.",
        );
      pathNetworkLoading.current = true;
      void loadPathNetwork(here, sport)
        .then((network) => {
          if (!activeRef.current || run !== navigationRun.current) return;
          pathNetwork.current = { center: here, ...network };
          if (network.limited || network.lines.length) return;
          const kind =
            sport === "ride" ? "cycle tracks or lanes" : "walking paths";
          const warning = `No mapped ${kind} appear nearby. Check signs and traffic before continuing.`;
          setNotice(warning);
          if (!mutedRef.current) speakNavigation(warning);
        })
        .catch(() => {
          /* Missing map data must never imply a safety conclusion. */
        })
        .finally(() => {
          pathNetworkLoading.current = false;
        });
    } catch (error) {
      setNotice(userMessage(error));
    } finally {
      setPlanning(false);
    }
  }
  async function onPosition(fix: Location.LocationObject) {
    if (!activeRef.current || !currentRoute.current) return;
    const here = { lat: fix.coords.latitude, lng: fix.coords.longitude };
    setPosition(here);
    const next = navigationProgress(
      currentRoute.current,
      here,
      fix.coords.accuracy ?? 100,
      progressAlong.current,
    );
    setProgress(next);
    if (
      !pathNetworkLoading.current &&
      (!pathNetwork.current || distance(pathNetwork.current.center, here) > 700)
    ) {
      pathNetworkLoading.current = true;
      const requestRun = navigationRun.current;
      void loadPathNetwork(here, sport)
        .then((network) => {
          if (activeRef.current && requestRun === navigationRun.current)
            pathNetwork.current = { center: here, ...network };
        })
        .catch(() => {})
        .finally(() => {
          pathNetworkLoading.current = false;
        });
    }
    if (!next.offRoute && (fix.coords.accuracy ?? 100) <= 50)
      progressAlong.current = next.along;
    if (next.arrived) {
      if (!mutedRef.current)
        speakNavigation("You have arrived at your destination.");
      activeRef.current = false;
      watch.current?.remove();
      watch.current = null;
      setActive(false);
      setNotice("You’ve arrived.");
      return;
    }
    if (next.offRoute) offRouteCount.current++;
    else offRouteCount.current = 0;
    if (
      offRouteCount.current >= 3 &&
      Date.now() - lastReroute.current > 30_000 &&
      destination.current
    ) {
      lastReroute.current = Date.now();
      offRouteCount.current = 0;
      setNotice("Off route. Finding a new path…");
      if (!mutedRef.current)
        speakNavigation("You seem to be off route. Finding a new path.");
      const rerouteRun = navigationRun.current;
      try {
        const revised = await routeProvider.guide(
          usingSaved
            ? navigationStops(here, saved, reverse)
            : [here, destination.current],
          sport,
        );
        if (!activeRef.current || rerouteRun !== navigationRun.current) return;
        currentRoute.current = revised;
        progressAlong.current = 0;
        setRoute(revised);
        lastPrompt.current = "";
        infrastructureBucket.current = -1;
        setNotice("New route ready. Follow local signs and traffic rules.");
      } catch {
        if (!activeRef.current || rerouteRun !== navigationRun.current) return;
        try {
          const area = profile && (await offlineAreaAt(profile.id, here));
          const lines =
            sport === "ride" ? area?.cyclingLines : area?.walkingLines;
          const fallback =
            lines && destination.current
              ? offlineReroute(lines, here, destination.current)
              : null;
          if (!activeRef.current || rerouteRun !== navigationRun.current)
            return;
          if (fallback) {
            currentRoute.current = fallback;
            progressAlong.current = 0;
            lastPrompt.current = "";
            setOfflineArea(area);
            setRoute(fallback);
            pathNetwork.current = {
              center: area!.center,
              lines: lines!,
              limited: area!.limited,
            };
            infrastructureBucket.current = -1;
            const message =
              "Using downloaded mapped paths. Check signs and access before following them.";
            setNotice(message);
            if (!mutedRef.current) speakNavigation(message);
            return;
          }
        } catch {
          /* Keep the original route visible when offline routing fails. */
        }
        setNotice("Couldn’t reroute. Stop safely and check the map.");
      }
      return;
    }
    const band =
      next.distanceToStep < 30
        ? "now"
        : next.distanceToStep < 90
          ? "near"
          : next.distanceToStep < 280
            ? "advance"
            : "";
    const key = `${next.step.distanceAlong}:${band}`;
    if (band && key !== lastPrompt.current) {
      lastPrompt.current = key;
      if (!mutedRef.current) speakNavigation(approachInstruction(next));
    }
    const bucket = Math.floor(next.along / 300);
    const network = pathNetwork.current;
    if (
      bucket !== infrastructureBucket.current &&
      !next.offRoute &&
      next.distanceToStep > 100 &&
      network &&
      distance(network.center, here) <= 850
    ) {
      infrastructureBucket.current = bucket;
      const warning = upcomingInfrastructureWarning(
        currentRoute.current.points,
        network.lines,
        next.along,
        sport,
        network.limited,
      );
      if (warning) {
        setNotice(warning);
        if (!mutedRef.current) speakNavigation(warning);
      }
    }
  }
  const distanceText = progress
    ? progress.distanceToStep < 1000
      ? `${Math.round(progress.distanceToStep)} m`
      : `${(progress.distanceToStep / 1000).toFixed(1)} km`
    : "";
  return (
    <Screen
      title="Navigate"
      subtitle="Spoken directions from where you are"
      back
      contentStyle={{ gap: 24, paddingBottom: 120 }}
    >
      <View style={{ gap: 16 }}>
        {!active && (
          <>
            <Field
              label="Where do you want to go?"
              testID="navigation-destination"
              placeholder="Address, place, or latitude, longitude"
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setSelectedPlace(null);
              }}
              autoCorrect={false}
              autoComplete="off"
            />
            {!active && searching && (
              <ActivityIndicator
                color={c.accent}
                accessibilityLabel="Searching places"
              />
            )}
            {!active && suggestions.length > 0 && (
              <Animated.View
                style={{
                  opacity: suggestionOpacity,
                  borderWidth: 1,
                  borderColor: c.line,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
                accessibilityLabel="Place suggestions"
              >
                {suggestions.map((place) => (
                  <Pressable
                    key={place.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${place.name}, ${place.detail}`}
                    onPress={() => {
                      setSelectedPlace(place);
                      setQuery(place.name);
                      setSuggestions([]);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 15,
                      paddingVertical: 12,
                      backgroundColor: pressed ? c.soft : c.surface,
                      borderBottomWidth: 1,
                      borderBottomColor: c.line,
                    })}
                  >
                    <Txt weight="600" numberOfLines={1}>
                      {place.name}
                    </Txt>
                    {!!place.detail && (
                      <Txt size="caption" color={c.muted} numberOfLines={1}>
                        {place.detail}
                      </Txt>
                    )}
                  </Pressable>
                ))}
              </Animated.View>
            )}
            {!active && !!searchMessage && (
              <Txt size="caption" color={c.muted}>
                {searchMessage}
              </Txt>
            )}
            {!active && query.trim().length >= 3 && !selectedPlace && (
              <Txt size="caption" color={c.muted}>
                {config.googleMapsKey
                  ? "Google Maps"
                  : "Places from OpenStreetMap"}
              </Txt>
            )}
            <Segmented options={modes} value={sport} onChange={setSport} />
            {usingSaved && (
              <Segmented
                options={[
                  { label: "Follow route", value: "forward" },
                  { label: "Reverse route", value: "reverse" },
                ]}
                value={reverse ? "reverse" : "forward"}
                onChange={(value) => setReverse(value === "reverse")}
              />
            )}
            <Button
              title="Find routes"
              variant="secondary"
              loading={planning}
              disabled={!query.trim()}
              onPress={preview}
              icon={<MapPin size={18} color={c.text} />}
            />
            {!!detour && (
              <Row>
                <Txt size="caption" color={c.muted} style={{ flex: 1 }}>
                  Detour stop added. Find routes again to include it.
                </Txt>
                <Button
                  title="Remove stop"
                  variant="quiet"
                  onPress={() => setDetour(null)}
                />
              </Row>
            )}
            {route && !active && (
              <RouteMap
                points={route.points}
                network={
                  route.provider === "google" ? undefined : offlineArea?.lines
                }
                height={300}
                center={active && position ? position : undefined}
                autoFit={!active}
                showUserLocation
                followUser={active}
                waypoints={destination.current ? [destination.current] : []}
                onMapPress={
                  pickingDetour && !active
                    ? (point) => {
                        setDetour(point);
                        setPickingDetour(false);
                        setNotice(
                          "Detour chosen. Find routes again to include it.",
                        );
                      }
                    : undefined
                }
              />
            )}
            {choices.length > 0 && (
              <View style={{ gap: 6 }}>
                {choices.map((choice, index) => (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityState={{ selected: choice === route }}
                    onPress={() => setRoute(choice)}
                    style={({ pressed }) => ({
                      padding: 10,
                      minHeight: 48,
                      borderRadius: 8,
                      backgroundColor:
                        choice === route || pressed ? c.soft : c.surface,
                    })}
                  >
                    <Row>
                      <View style={{ flex: 1 }}>
                        <Txt weight="600">
                          {index === 0 ? "Main route" : `Alternative ${index}`}{" "}
                          · {km(choice.distance)} km
                        </Txt>
                        <Txt size="caption" color={c.muted}>
                          {choice.provider === "google"
                            ? "Google Maps"
                            : "OpenStreetMap paths"}
                          {usingSaved ? " · joins your saved route" : ""}
                        </Txt>
                      </View>
                      {choice === route && <Check size={20} color={c.good} />}
                    </Row>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
        <Button
          title={active ? "Stop guidance" : "Start guidance"}
          onPress={active ? stop : start}
          disabled={!active && !query.trim() && !saved}
          testID="start-navigation"
          loading={planning}
          icon={<Navigation2 size={18} color={c.text} />}
        />
        {!active && (
          <Row style={{ flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Txt weight="600">Voice guidance</Txt>
              <Txt size="caption" color={c.muted}>
                One English voice, chosen automatically from your phone.
              </Txt>
            </View>
            <Button
              title="Hear sample"
              variant="quiet"
              onPress={() =>
                speakNavigation("In 200 metres, turn left onto the path.", {
                  repeat: true,
                })
              }
            />
          </Row>
        )}
        {!active && (
          <Button
            title="Navigate in Google Maps"
            variant="quiet"
            disabled={!query.trim()}
            onPress={() =>
              Linking.openURL(
                googleMapsUrl(
                  destination.current ?? selectedPlace?.coordinate ?? query,
                  sport,
                  usingSaved && saved
                    ? navigationStops(
                        position ?? saved.points[0]!,
                        saved,
                        reverse,
                      ).slice(1, -1)
                    : [],
                ),
              )
            }
          />
        )}
        {active && (
          <Row>
            <Button
              title={muted ? "Unmute" : "Mute voice"}
              variant="secondary"
              onPress={() => {
                mutedRef.current = !muted;
                setMuted(!muted);
                if (!mutedRef.current && progress)
                  speakNavigation(approachInstruction(progress));
                else stopNavigationVoice();
              }}
            />
            <Button
              title="Repeat turn"
              variant="quiet"
              disabled={muted || !progress}
              onPress={() => {
                if (progress)
                  speakNavigation(approachInstruction(progress), {
                    repeat: true,
                  });
              }}
            />
          </Row>
        )}
      </View>
      {route && active && (
        <RouteMap
          points={route.points}
          height={360}
          center={position ?? undefined}
          autoFit={false}
          showUserLocation
          followUser
        />
      )}
      {route && !active && (
        <Button
          title={
            pickingDetour ? "Cancel stop selection" : "Add a detour on the map"
          }
          variant="secondary"
          onPress={() => setPickingDetour(!pickingDetour)}
        />
      )}
      {pickingDetour && (
        <Txt color={c.muted}>Tap a place on the map to pass through it.</Txt>
      )}
      {!!route?.warnings?.length && (
        <Txt size="caption" color={c.muted}>
          {route.warnings.join(" ")}
        </Txt>
      )}
      {progress && (
        <Card dark>
          <Txt color="#FFFFFF" size="caption">
            Next turn in {distanceText}
          </Txt>
          <Txt color="#FFFFFF" size="heading" weight="700">
            {progress.step.instruction}
          </Txt>
        </Card>
      )}
      {notice ? <Notice text={notice} /> : null}
      <View style={{ gap: 6 }}>
        <Txt size="caption" color={c.muted}>
          Voice uses your phone’s installed speech engine and audio output.
          Navigation works only while this screen is open. Maps can omit walking
          or cycling facilities; check signs and traffic before turning.
        </Txt>
      </View>
    </Screen>
  );
}

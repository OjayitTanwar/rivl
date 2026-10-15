import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Search,
  Route,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  Trophy,
} from "lucide-react-native";
import { useStore } from "../../src/state/store";
import { explorationProgress } from "../../src/domain/exploration";
import { heatmapCells } from "../../src/domain/heatmap";
import { distance } from "../../src/domain/geo";
import { nearbyMapLines, nearbyCoordinates } from "../../src/domain/nearby-map";
import type { Coordinate, Sample, Sport } from "../../src/domain/types";
import { plannerLocation } from "../../src/services/route-location";
import { popularCells } from "../../src/services/popularity";
import { AppFailure, userMessage } from "../../src/security/errors";
import { LoadingJourney } from "../../src/ui/LoadingJourney";
import RouteMap from "../../src/ui/RouteMap";
import {
  Txt,
  Row,
  Stack,
  Button,
  Choice,
  ListRow,
} from "../../src/ui/primitives";
import { XPBar } from "../../src/ui/ExplorationCard";
import { useTheme } from "../../src/ui/theme";
import { km } from "../../src/domain/format";

type Layer = "routes" | "segments" | "personal" | "community" | "explore";
export default function Maps() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    place?: string;
    provider?: string;
  }>();
  const [chosen, setChosen] = useState<Coordinate>();
  const selectedArea = useRef<Coordinate | undefined>(undefined);
  const communityRequest = useRef(0);
  const { activities, routes, segments, session } = useStore(),
    { c } = useTheme();
  const focused = useIsFocused();
  const [recenterKey, setRecenterKey] = useState(0),
    [layer, setLayer] = useState<Layer>("routes"),
    [sport, setSport] = useState<Sport>("ride"),
    [period, setPeriod] = useState("year"),
    [mapStyle, setMapStyle] = useState<"roadmap" | "terrain" | "satellite">(
      "roadmap",
    ),
    [expanded, setExpanded] = useState(false),
    [height, setHeight] = useState(380),
    [position, setPosition] = useState<Coordinate>(),
    [viewport, setViewport] = useState<Coordinate>(),
    [locating, setLocating] = useState(true),
    [error, setError] = useState(""),
    [community, setCommunity] = useState<
      { lat: number; lng: number; visits: number }[]
    >([]),
    [communityBusy, setCommunityBusy] = useState(false),
    [communityLoaded, setCommunityLoaded] = useState(false);
  const actual = useMemo(
    () => activities.filter((a) => !a.demo && !a.simulated),
    [activities],
  );
  const last = actual.find((a) => a.route.length)?.route.at(-1);
  const anchor = chosen ?? position ?? last;
  const area = viewport ?? anchor;
  const progress = useMemo(() => explorationProgress(actual), [actual]);
  const visible = useMemo(
    () =>
      actual.filter(
        (a) =>
          a.sport === sport &&
          (period === "all" ||
            a.startedAt >=
              Date.now() - (period === "month" ? 30 : 365) * 86400000),
      ),
    [actual, sport, period],
  );
  const atlas = useMemo(
    () =>
      area
        ? nearbyMapLines(
            visible.slice(0, 100).map((a) => a.route),
            area,
          )
        : [],
    [visible, area],
  );
  const cells = useMemo(
    () => (area ? heatmapCells(atlas).slice(0, 1200) : []),
    [atlas, area],
  );
  const localRoutes = useMemo(
    () =>
      area
        ? routes
            .filter(
              (r) =>
                r.sport === sport &&
                r.points.some((p) => distance(area, p) < 12000),
            )
            .slice(0, 20)
        : [],
    [routes, sport, area],
  );
  const routeLines = useMemo(
    () =>
      area
        ? nearbyMapLines(
            localRoutes.map((r) => r.points),
            area,
          )
        : [],
    [localRoutes, area],
  );
  const localSegments = useMemo(
    () =>
      area
        ? segments
            .filter(
              (s) =>
                s.sport === sport &&
                s.points.some((p) => distance(area, p) < 12000),
            )
            .slice(0, 40)
        : [],
    [segments, sport, area],
  );
  const segmentLines = useMemo(
    () =>
      area
        ? localSegments.flatMap((s) =>
            nearbyMapLines(
              [
                s.points.map((p, i): Sample => ({
                  ...p,
                  t: i,
                  accuracy: 0,
                  segment: 0,
                })),
              ],
              area,
            ).map((points) => ({ title: s.name, color: c.accent, points })),
          )
        : [],
    [localSegments, area, c.accent],
  );
  const localCommunity = useMemo(
    () => (area ? nearbyCoordinates(community, area) : []),
    [community, area],
  );
  useEffect(() => {
    if (params.lat === undefined || params.lng === undefined) return;
    const p = { lat: Number(params.lat), lng: Number(params.lng) };
    if (
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lng) > 180
    )
      return;
    selectedArea.current = p;
    setChosen(p);
    setViewport(p);
    setError("");
    setLocating(false);
    setRecenterKey((k) => k + 1);
  }, [params.lat, params.lng]);
  const locate = async () => {
    selectedArea.current = undefined;
    setChosen(undefined);
    setLocating(true);
    setError("");
    try {
      const p = await plannerLocation();
      setPosition(p);
      setViewport(p);
      setRecenterKey((k) => k + 1);
    } catch (e) {
      setError(
        e instanceof AppFailure
          ? userMessage(e)
          : "Location unavailable. Check location access or search for a destination.",
      );
    } finally {
      setLocating(false);
    }
  };
  useEffect(() => {
    let mounted = true;
    void plannerLocation()
      .then((p) => {
        if (mounted) {
          setPosition(p);
          if (!selectedArea.current) {
            setViewport(p);
            setRecenterKey((k) => k + 1);
          }
        }
      })
      .catch((e) => {
        if (mounted && !selectedArea.current)
          setError(
            e instanceof AppFailure
              ? userMessage(e)
              : "Location unavailable. Check location access or search for a destination.",
          );
      })
      .finally(() => {
        if (mounted) setLocating(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    communityRequest.current++;
    setCommunityBusy(false);
    setCommunity([]);
    setCommunityLoaded(false);
  }, [sport, period, session?.userId]);
  useEffect(() => {
    communityRequest.current++;
    setCommunityBusy(false);
    setCommunityLoaded(false);
  }, [area?.lat, area?.lng]);
  const suggest = () =>
    router.push({
      pathname: "/suggested-routes",
      params: {
        sport,
        ...(area ? { lat: String(area.lat), lng: String(area.lng) } : {}),
      },
    });
  const loadCommunity = async () => {
    if (!area) return;
    const request = ++communityRequest.current;
    setCommunityBusy(true);
    setError("");
    try {
      const data = await popularCells(
        area,
        sport,
        period === "all"
          ? 0
          : Date.now() - (period === "month" ? 30 : 365) * 86400000,
      );
      if (request === communityRequest.current) {
        setCommunity(data);
        setCommunityLoaded(true);
      }
    } catch (e) {
      if (request === communityRequest.current) setError(userMessage(e));
    } finally {
      if (request === communityRequest.current) setCommunityBusy(false);
    }
  };
  const titles: Record<Layer, string> = {
    routes: "Routes around here",
    segments: "Segments around here",
    personal: "Your personal heatmap",
    community: "Community heatmap",
    explore: "Your exploration",
  };
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack
        gap={10}
        style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}
      >
        <Row between>
          <Txt size="heading" weight="700">
            Maps
          </Txt>
          <Button
            title="Saved routes"
            variant="quiet"
            icon={<Route size={19} color={c.text} />}
            onPress={() => router.push("/routes")}
            style={{ minHeight: 44, paddingVertical: 8, paddingHorizontal: 0 }}
          />
        </Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search for a destination"
          onPress={() => router.push("/map-search")}
          style={{
            backgroundColor: c.soft,
            borderRadius: 14,
            minHeight: 48,
            paddingHorizontal: 14,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Search size={20} color={c.muted} />
          <Txt color={c.muted} style={{ flex: 1 }}>
            {chosen && params.place ? params.place : "Where do you want to go?"}
          </Txt>
          <ChevronRight size={18} color={c.muted} />
        </Pressable>
        <Row style={{ flexWrap: "wrap", gap: 8 }}>
          <Choice
            label="Sport"
            value={sport}
            onChange={setSport}
            options={[
              { label: "Ride", value: "ride" },
              { label: "Run", value: "run" },
              { label: "Walk", value: "walk" },
            ]}
          />
          <Choice
            label="Show"
            value={layer}
            onChange={(v) => {
              setLayer(v);
              setExpanded(false);
            }}
            options={[
              { label: "Routes", value: "routes" },
              { label: "Segments", value: "segments" },
              { label: "Personal heatmap", value: "personal" },
              { label: "Community heatmap", value: "community" },
              { label: "Explore", value: "explore" },
            ]}
          />
        </Row>
      </Stack>
      <View
        style={{ flex: 1, minHeight: 160, backgroundColor: c.soft }}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      >
        {focused && anchor ? (
          <RouteMap
            points={[]}
            height={height}
            borderRadius={0}
            center={anchor}
            localFocus
            allowMapboxFallback={!chosen || params.provider === "osm"}
            autoFit={false}
            recenterKey={recenterKey}
            onLocate={locate}
            showUserLocation={!!position && !chosen}
            mapStyle={mapStyle}
            cyclingLayer={sport === "ride"}
            showMapTypeControl={false}
            onViewportChange={(p) =>
              setViewport((old) => (!old || distance(old, p) > 500 ? p : old))
            }
            explorationRoutes={
              layer === "explore" ? atlas.slice().reverse() : undefined
            }
            cells={
              layer === "personal"
                ? cells
                : layer === "community"
                  ? localCommunity
                  : undefined
            }
            lines={layer === "routes" ? routeLines : []}
            highlights={layer === "segments" ? segmentLines : undefined}
          />
        ) : (
          <Stack
            gap={12}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            {locating ? (
              <>
                <LoadingJourney fullScreen label="Finding your nearby area…" />
              </>
            ) : (
              <>
                <Compass size={32} color={c.accent} />
                <Txt weight="700">Start near you</Txt>
                <Txt color={c.muted}>
                  Allow location to see nearby routes, or search for a
                  destination.
                </Txt>
                <Button title="Try my location" onPress={locate} />
              </>
            )}
          </Stack>
        )}
      </View>
      <Stack
        gap={8}
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: Platform.OS === "web" ? 90 : 86,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.line,
        }}
      >
        <ListRow
          title="Community tracks"
          detail="Shared GPS evidence and automatic contributions"
          onPress={() => router.push("/community-tracks")}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${titles[layer]}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={{
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Stack gap={2} style={{ flex: 1 }}>
            <Txt weight="700">{titles[layer]}</Txt>
            <Txt size="micro" color={c.muted}>
              {layer === "routes"
                ? `${localRoutes.length} saved nearby · discover a new loop`
                : layer === "segments"
                  ? `${localSegments.length} mapped segments nearby`
                  : "Only nearby activity paths are drawn"}
            </Txt>
          </Stack>
          {expanded ? (
            <ChevronDown size={20} color={c.text} />
          ) : (
            <ChevronUp size={20} color={c.text} />
          )}
        </Pressable>
        {!!error && (
          <Txt size="caption" color={c.accent}>
            {error}
            {!position && last
              ? " Showing the area of your last activity."
              : ""}
          </Txt>
        )}
        {expanded && (
          <ScrollView
            style={{ maxHeight: 240 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
          >
            <Row style={{ flexWrap: "wrap", gap: 8 }}>
              <Choice
                label="Map"
                value={mapStyle}
                onChange={setMapStyle}
                options={[
                  { label: "Street", value: "roadmap" },
                  { label: "Terrain", value: "terrain" },
                  { label: "Satellite", value: "satellite" },
                ]}
              />
              {(layer === "personal" ||
                layer === "community" ||
                layer === "explore") && (
                <Choice
                  label="Period"
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { label: "Month", value: "month" },
                    { label: "Year", value: "year" },
                    { label: "All time", value: "all" },
                  ]}
                />
              )}
            </Row>
            {layer === "routes" &&
              (localRoutes.length ? (
                localRoutes.slice(0, 5).map((r) => (
                  <ListRow
                    key={r.id}
                    title={r.name}
                    detail={`${km(r.distance)} km · ${r.surface}`}
                    onPress={() =>
                      router.push({
                        pathname: "/navigate",
                        params: { route: r.id },
                      })
                    }
                  />
                ))
              ) : (
                <Txt color={c.muted}>
                  No saved routes nearby. Find a loop or create your own.
                </Txt>
              ))}
            {layer === "segments" && (
              <>
                <Txt color={c.muted}>
                  {localSegments.length
                    ? "Open rankings to compare your efforts."
                    : "No mapped segments in this area yet."}
                </Txt>
                <Button
                  title="Segment leaderboards"
                  variant="secondary"
                  icon={<Trophy size={18} color={c.text} />}
                  onPress={() => router.push("/segments")}
                />
              </>
            )}
            {layer === "personal" && (
              <Txt color={c.muted}>
                {cells.length
                  ? "Darker coral means more visits. Your heatmap stays private."
                  : "Record an activity here to start your personal heatmap."}
              </Txt>
            )}
            {layer === "community" && (
              <>
                <Txt color={c.muted}>
                  {session?.local
                    ? "Sign in to see shared path data. Your personal heatmap still works."
                    : communityLoaded && !community.length
                      ? "No community coverage in this area yet."
                      : "Uses public RIVL activity paths with a minimum of three athletes per cell."}
                </Txt>
                <Button
                  title="Search this area"
                  loading={communityBusy}
                  disabled={!area || !session || !!session.local}
                  onPress={loadCommunity}
                />
              </>
            )}
            {layer === "explore" && (
              <>
                <Row between>
                  <Txt weight="700">Level {progress.level}</Txt>
                  <Txt color={c.muted}>{progress.xp} XP</Txt>
                </Row>
                <XPBar value={progress.levelProgress} />
                <Txt color={c.muted}>
                  Discover new territory to unlock rewards.
                </Txt>
                <Button
                  title="Exploration quests"
                  variant="secondary"
                  onPress={() => router.push("/heatmap")}
                />
              </>
            )}
            <ListRow
              title="Offline paths & directions"
              detail="Save guidance before heading out"
              icon={<Download size={20} color={c.text} />}
              onPress={() => router.push("/offline-maps")}
            />
          </ScrollView>
        )}
        <Row>
          <Button
            title="Find a loop here"
            onPress={suggest}
            disabled={!area}
            style={{ flex: 1 }}
          />
          <Button
            title="Create route"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: "/route-planner",
                params: {
                  sport,
                  ...(area
                    ? { lat: String(area.lat), lng: String(area.lng) }
                    : {}),
                },
              })
            }
            style={{ flex: 1 }}
          />
        </Row>
      </Stack>
    </SafeAreaView>
  );
}

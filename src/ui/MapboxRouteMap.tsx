import { useFullScreenLoading } from "./loading-state";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import * as Linking from "expo-linking";
import { LocateFixed } from "lucide-react-native";
import type { MapProps } from "./map-types";
import { config } from "../services/config";
import { useTheme } from "./theme";
import { Button, Choice, IconButton, Txt } from "./primitives";
import { LoadingJourney } from "./LoadingJourney";
import { mapboxMapDocument, mapPayload } from "./mapbox-map-document";

type Props = MapProps & { token?: string; onError?: (reason: string) => void };
export default memo(function MapboxRouteMap(props: Props) {
  const { c, reduceMotion } = useTheme();
  const token = (props.token ?? config.mapboxToken).trim();
  const view = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState("");
  const [mapType, setMapType] = useState<"roadmap" | "terrain" | "satellite">(
    "roadmap",
  );
  const source = useMemo(
    () => ({
      html: mapboxMapDocument(token, c.dark),
      baseUrl: config.googleMapsBaseUrl,
    }),
    [token],
  );
  const hasGeography =
    !!props.center ||
    props.points.length > 0 ||
    !!props.lines?.some((line) => line.length) ||
    !!props.network?.some((line) => line.length) ||
    !!props.explorationRoutes?.some((line) => line.length) ||
    !!props.cells?.length ||
    !!props.tiles?.length;
  const covered = useFullScreenLoading(
    hasGeography &&
      props.fullScreenLoading !== false &&
      props.interactive !== false &&
      token.startsWith("pk.") &&
      !loaded &&
      !failure,
    "Loading your nearby map…",
  );
  const payload = JSON.stringify({
    ...JSON.parse(mapPayload(props, c.dark)),
    reduceMotion,
  });
  const inject = (script: string) =>
    view.current?.injectJavaScript(`${script};true;`);
  useEffect(() => {
    setReady(false);
    setLoaded(false);
    setWaiting(false);
    setFailure("");
  }, [token]);
  useEffect(() => {
    if (ready) inject(`window.draw(${payload.replace(/</g, "\\u003c")})`);
  }, [ready, payload]);
  useEffect(() => {
    if (ready && !props.mapStyle) inject(`window.mapType('${mapType}')`);
  }, [ready, mapType, props.mapStyle]);
  useEffect(() => {
    if (ready && props.recenterKey) inject("window.recenter()");
  }, [ready, props.recenterKey]);
  const fail = (reason: string) => {
    setFailure(reason);
    props.onError?.(reason);
  };
  const publicToken = token.startsWith("pk.");
  return (
    <View
      style={{
        height: props.height ?? 260,
        borderRadius: props.borderRadius ?? 8,
        overflow: "hidden",
        backgroundColor: c.soft,
      }}
      accessibilityLabel="Mapbox route map"
    >
      {publicToken && (
        <WebView
          key={token}
          ref={view}
          source={source}
          style={{ backgroundColor: c.bg }}
          originWhitelist={["https://*", "about:blank"]}
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          onError={() => fail("unavailable")}
          onContentProcessDidTerminate={() => view.current?.reload()}
          onLoadStart={() => {
            setReady(false);
            setLoaded(false);
            setWaiting(false);
            setFailure("");
          }}
          onMessage={(event) => {
            try {
              const m = JSON.parse(event.nativeEvent.data);
              if (m.type === "ready") {
                setReady(true);
                setFailure("");
              } else if (m.type === "loaded") {
                setLoaded(true);
                setFailure("");
              } else if (m.type === "waiting") setWaiting(true);
              else if (m.type === "loading") {
                setLoaded(false);
                setWaiting(false);
              } else if (m.type === "error")
                fail(typeof m.reason === "string" ? m.reason : "unavailable");
              else if (
                (m.type === "viewport" || m.type === "point") &&
                Number.isFinite(m.lat) &&
                Number.isFinite(m.lng) &&
                Math.abs(m.lat) <= 90 &&
                Math.abs(m.lng) <= 180
              ) {
                if (m.type === "viewport")
                  props.onViewportChange?.({ lat: m.lat, lng: m.lng });
                else if (props.interactive !== false)
                  props.onMapPress?.({ lat: m.lat, lng: m.lng });
              }
            } catch {}
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url === "about:blank") return true;
            try {
              if (
                new URL(request.url).origin ===
                new URL(config.googleMapsBaseUrl).origin
              )
                return true;
            } catch {}
            if (request.url.startsWith("https://"))
              void Linking.openURL(request.url).catch(() => {});
            return false;
          }}
        />
      )}
      {!covered && publicToken && !loaded && !failure && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            borderRadius: 8,
            backgroundColor: c.surface,
          }}
        >
          <LoadingJourney
            compact
            label={
              waiting ? "Waiting for your map location…" : "Loading Mapbox map…"
            }
          />
        </View>
      )}
      {ready && !failure && props.interactive !== false && (
        <View
          style={{
            position: "absolute",
            right: 12,
            top: props.controlsTop ?? 12,
            gap: 8,
          }}
        >
          <IconButton
            label="Recenter map"
            onPress={() =>
              props.onLocate ? props.onLocate() : inject("window.recenter()")
            }
          >
            <LocateFixed size={20} color={c.text} />
          </IconButton>
          {props.showMapTypeControl !== false && !props.mapStyle && (
            <Choice
              label="Map"
              options={[
                { label: "Street", value: "roadmap" },
                { label: "Terrain", value: "terrain" },
                { label: "Satellite", value: "satellite" },
              ]}
              value={mapType}
              onChange={setMapType}
            />
          )}
        </View>
      )}
      {(!publicToken || failure) && (
        <View
          accessibilityRole="alert"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            padding: 14,
            borderRadius: 8,
            backgroundColor: c.surface,
            gap: 8,
          }}
        >
          <Txt size="caption">
            {!token
              ? "Mapbox needs a configured public access token. Your route data is still available."
              : !publicToken || failure === "token"
                ? "Mapbox couldn’t verify its access token. Check this build’s map configuration."
                : failure === "unsupported"
                  ? "This device’s web view cannot display Mapbox maps. Your route data is still available."
                  : "Mapbox couldn’t load. Check your connection and try again. Your route data is still available."}
          </Txt>
          {publicToken && (
            <Button
              title="Reload map"
              variant="quiet"
              onPress={() => {
                setReady(false);
                setLoaded(false);
                setWaiting(false);
                setFailure("");
                view.current?.reload();
              }}
            />
          )}
        </View>
      )}
    </View>
  );
});

import { useFullScreenLoading } from "./loading-state";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import * as Linking from "expo-linking";
import { LocateFixed, Layers } from "lucide-react-native";
import type { MapProps } from "./map-types";
import { config } from "../services/config";
import { useTheme } from "./theme";
import { Button, IconButton, Txt } from "./primitives";
import { LoadingJourney } from "./LoadingJourney";
import { googleMapDocument, mapPayload } from "./google-map-document";
export default memo(function GoogleRouteMap(
  props: MapProps & { onError?: () => void },
) {
  const { c } = useTheme();
  const view = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [satellite, setSatellite] = useState(false);
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
      !!config.googleMapsKey &&
      !tilesLoaded &&
      !failed,
    "Drawing nearby paths…",
  );
  const payload = mapPayload(props, c.dark);
  const source = useMemo(
    () => ({
      html: googleMapDocument(config.googleMapsKey, c.dark),
      baseUrl: config.googleMapsBaseUrl,
    }),
    [],
  );
  const inject = (script: string) =>
    view.current?.injectJavaScript(`${script};true;`);
  useEffect(() => {
    if (ready) inject(`window.draw(${payload.replace(/</g, "\\u003c")})`);
  }, [payload, ready]);
  useEffect(() => {
    if (ready && !props.mapStyle)
      inject(`window.mapType('${satellite ? "satellite" : "roadmap"}')`);
  }, [satellite, ready, props.mapStyle]);
  useEffect(() => {
    if (ready && props.recenterKey) inject("window.recenter()");
  }, [props.recenterKey, ready]);
  useEffect(() => {
    if (failed) props.onError?.();
  }, [failed, props.onError]);
  return (
    <View
      style={{
        height: props.height ?? 260,
        borderRadius: props.borderRadius ?? 8,
        overflow: "hidden",
        backgroundColor: c.soft,
      }}
      accessibilityLabel="Google Maps route"
    >
      {!!config.googleMapsKey && (
        <WebView
          ref={view}
          source={source}
          style={{ backgroundColor: c.bg }}
          originWhitelist={["https://*", "about:blank"]}
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          onError={() => setFailed(true)}
          onContentProcessDidTerminate={() => view.current?.reload()}
          onLoadStart={() => {
            setReady(false);
            setTilesLoaded(false);
          }}
          onMessage={(event) => {
            try {
              const m = JSON.parse(event.nativeEvent.data);
              if (m.type === "ready") {
                setReady(true);
                setFailed(false);
              } else if (m.type === "loaded") setTilesLoaded(true);
              else if (m.type === "loading") setTilesLoaded(false);
              else if (m.type === "error") setFailed(true);
              else if (
                m.type === "viewport" &&
                Number.isFinite(m.lat) &&
                Number.isFinite(m.lng) &&
                Math.abs(m.lat) <= 90 &&
                Math.abs(m.lng) <= 180
              )
                props.onViewportChange?.({ lat: m.lat, lng: m.lng });
              else if (
                m.type === "point" &&
                Number.isFinite(m.lat) &&
                Number.isFinite(m.lng)
              )
                props.onMapPress?.({ lat: m.lat, lng: m.lng });
            } catch {}
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (
              request.url === "about:blank" ||
              request.url.startsWith(config.googleMapsBaseUrl)
            )
              return true;
            if (request.url.startsWith("https://"))
              void Linking.openURL(request.url);
            return false;
          }}
        />
      )}
      {!covered && !tilesLoaded && !failed && !!config.googleMapsKey && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            borderRadius: 14,
            backgroundColor: c.surface,
          }}
        >
          <LoadingJourney compact label="Drawing nearby paths…" />
        </View>
      )}
      {ready && props.interactive !== false && (
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
          {props.showMapTypeControl !== false && (
            <IconButton
              label={satellite ? "Show street map" : "Show satellite map"}
              onPress={() => setSatellite(!satellite)}
            >
              <Layers size={20} color={c.text} />
            </IconButton>
          )}
        </View>
      )}
      {(failed || !config.googleMapsKey) && (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: 12,
            padding: 14,
            borderRadius: 8,
            backgroundColor: c.surface,
            gap: 8,
          }}
        >
          <Txt size="caption">
            {config.googleMapsKey
              ? "Google Maps couldn’t load. Reconnect or try again later. Your route is saved."
              : "Google Maps needs a configured key. Your route is saved."}
          </Txt>
          {!!config.googleMapsKey && (
            <Button
              variant="quiet"
              title="Reload map"
              onPress={() => {
                setReady(false);
                setFailed(false);
                view.current?.reload();
              }}
            />
          )}
        </View>
      )}
    </View>
  );
});

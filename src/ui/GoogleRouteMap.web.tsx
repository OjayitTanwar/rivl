import { useFullScreenLoading } from "./loading-state";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { LocateFixed, Layers } from "lucide-react-native";
import type { MapProps } from "./map-types";
import { LoadingJourney } from "./LoadingJourney";
import { googleMapDocument, mapPayload } from "./google-map-document";
import { config } from "../services/config";
import { useTheme } from "./theme";
import { IconButton, Button, Txt } from "./primitives";
export default memo(function GoogleRouteMap(
  props: MapProps & { onError?: () => void },
) {
  const { c } = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [satellite, setSatellite] = useState(false);
  const html = useMemo(
    () => googleMapDocument(config.googleMapsKey, c.dark),
    [],
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
      !!config.googleMapsKey &&
      !tilesLoaded &&
      !failed,
    "Drawing nearby paths…",
  );
  const payload = mapPayload(props, c.dark);
  const latest = useRef(props);
  latest.current = props;
  const send = (message: object) =>
    frame.current?.contentWindow?.postMessage(
      { rivlMap: true, ...message },
      "*",
    );
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.rivlMap) return;
      const m = e.data;
      if (m.type === "ready") {
        setReady(true);
        setFailed(false);
      }
      if (m.type === "loading") setTilesLoaded(false);
      if (m.type === "loaded") setTilesLoaded(true);
      if (m.type === "error") setFailed(true);
      if (
        m.type === "viewport" &&
        Number.isFinite(m.lat) &&
        Number.isFinite(m.lng) &&
        Math.abs(m.lat) <= 90 &&
        Math.abs(m.lng) <= 180
      )
        latest.current.onViewportChange?.({ lat: m.lat, lng: m.lng });
      if (
        m.type === "point" &&
        Number.isFinite(m.lat) &&
        Number.isFinite(m.lng)
      )
        latest.current.onMapPress?.({ lat: m.lat, lng: m.lng });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if (ready) send({ type: "draw", payload: JSON.parse(payload) });
  }, [ready, payload]);
  useEffect(() => {
    if (ready && !props.mapStyle)
      send({ type: "mapType", value: satellite ? "satellite" : "roadmap" });
  }, [ready, satellite, props.mapStyle]);
  useEffect(() => {
    if (ready && props.recenterKey) send({ type: "recenter" });
  }, [ready, props.recenterKey]);
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
    >
      {!!config.googleMapsKey && (
        <iframe
          ref={frame}
          srcDoc={html}
          title="Google Maps route"
          style={{
            height: "100%",
            width: "100%",
            border: 0,
            backgroundColor: c.bg,
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
              props.onLocate ? props.onLocate() : send({ type: "recenter" })
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
            top: 12,
            left: 12,
            right: 12,
            padding: 14,
            backgroundColor: c.surface,
            gap: 8,
          }}
        >
          <Txt>Google Maps couldn’t load. Your route is saved.</Txt>
          <Button
            title="Reload map"
            variant="quiet"
            onPress={() => {
              setReady(false);
              setTilesLoaded(false);
              setFailed(false);
              if (frame.current) frame.current.srcdoc = html;
            }}
          />
        </View>
      )}
    </View>
  );
});

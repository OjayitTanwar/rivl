import React, { memo, useCallback, useState } from "react";
import { View } from "react-native";
import GoogleRouteMap from "./GoogleRouteMap";
import MapboxRouteMap from "./MapboxRouteMap";
import { config } from "../services/config";
import { useMapboxFallback } from "../domain/map-provider";
import { Row, Txt, Button } from "./primitives";
import { useTheme } from "./theme";
import type { MapProps } from "./map-types";
export type { MapProps } from "./map-types";
export default memo(function RouteMap(props: MapProps) {
  const [googleFailed, setGoogleFailed] = useState(false);
  const failed = useCallback(() => setGoogleFailed(true), []);
  const { c } = useTheme();
  const fallback = useMapboxFallback(
    props.allowMapboxFallback,
    config.mapboxToken,
    config.googleMapsKey,
    googleFailed,
  );
  if (!fallback) return <GoogleRouteMap {...props} onError={failed} />;
  return (
    <View style={{ height: props.height ?? 260 }}>
      <Row
        style={{
          height: 52,
          paddingHorizontal: 12,
          backgroundColor: c.surface,
        }}
      >
        <Txt size="micro" color={c.muted}>
          Mapbox · fallback map
        </Txt>
        {!!config.googleMapsKey && (
          <Button
            title="Retry Google"
            variant="quiet"
            onPress={() => setGoogleFailed(false)}
          />
        )}
      </Row>
      <MapboxRouteMap
        {...props}
        height={Math.max(80, (props.height ?? 260) - 52)}
      />
    </View>
  );
});

import React, { memo } from "react";
import type { Sample } from "../domain/types";
import RouteMap from "./RouteMap";
export const RoutePreview = memo(function RoutePreview({
  points,
}: {
  points: Sample[];
}) {
  return (
    <RouteMap
      points={points}
      height={180}
      interactive={false}
      borderRadius={0}
    />
  );
});

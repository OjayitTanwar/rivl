import React from "react";
import RouteMap from "./RouteMap";
import type { MapProps } from "./map-types";
export default function HeatmapMap(props: Pick<MapProps, "cells" | "tiles">) {
  return <RouteMap points={[]} height={440} {...props} />;
}

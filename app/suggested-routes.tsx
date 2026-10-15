import React, { useState } from "react";
import { Keyboard } from "react-native";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Button,
  Card,
  Field,
  Segmented,
  Notice,
  Row,
} from "../src/ui/primitives";
import RouteMap from "../src/ui/RouteMap";
import { plannerLocation } from "../src/services/route-location";
import { routeProvider } from "../src/services/route-planning";
import { popularCells } from "../src/services/popularity";
import { routeSuggestionStops } from "../src/domain/suggested-routes";
import type { Sport, RoutePlan } from "../src/domain/types";
import { km } from "../src/domain/format";
import { userMessage } from "../src/security/errors";
import { readRouteIntent } from "../src/services/route-intent";
export default function SuggestedRoutes() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    sport?: string;
  }>();
  const supplied =
    Number.isFinite(Number(params.lat)) &&
    Number.isFinite(Number(params.lng)) &&
    params.lat !== undefined &&
    params.lng !== undefined &&
    Math.abs(Number(params.lat)) <= 90 &&
    Math.abs(Number(params.lng)) <= 180
      ? { lat: Number(params.lat), lng: Number(params.lng) }
      : undefined;
  const { saveRoute } = useStore(),
    [sport, setSport] = useState<Sport>(
      params.sport === "run" || params.sport === "walk" ? params.sport : "ride",
    ),
    [length, setLength] = useState("5"),
    [request, setRequest] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [routes, setRoutes] = useState<RoutePlan[]>([]),
    [popular, setPopular] = useState(false);
  async function suggest() {
    setBusy(true);
    setError("");
    setRoutes([]);
    try {
      const meters = Number(length) * 1000;
      if (!Number.isFinite(meters) || meters < 1000 || meters > 20000)
        throw new Error("Choose a distance from 1–20 km.");
      const center = supplied ?? (await plannerLocation());
      const cells = await popularCells(
        center,
        sport,
        Date.now() - 365 * 86400000,
      ).catch(() => []);
      setPopular(cells.length > 0);
      let failed = 0;
      for (const [i, bearing] of [0, 120, 240].entries()) {
        if (i) await new Promise((resolve) => setTimeout(resolve, 1200));
        try {
          const stops = routeSuggestionStops(center, meters, bearing, cells),
            line = await routeProvider.route(stops, sport);
          if (line.distance > meters * 2 || line.distance < meters * 0.3) {
            failed++;
            continue;
          }
          setRoutes((old) => [
            ...old,
            {
              id: Crypto.randomUUID(),
              name: ["Northward loop", "Southeast loop", "Southwest loop"][i]!,
              sport,
              points: line.points,
              distance: line.distance,
              ascent: 0,
              surface: "Mapped roads and paths; check access locally",
              saved: true,
              waypoints: stops,
              routing: "paths",
            },
          ]);
        } catch {
          failed++;
        }
      }
      if (failed === 3)
        throw new Error(
          "No suitable loops could be found here. Try a different distance or use the route planner.",
        );
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Find your next loop." back>
      <Field
        label="Describe an activity and distance"
        value={request}
        onChangeText={setRequest}
        placeholder="A 5 km walk around me"
        maxLength={500}
      />
      <Button
        title="Use request"
        variant="secondary"
        disabled={!request.trim() || busy}
        onPress={async () => {
          Keyboard.dismiss();
          setBusy(true);
          setError("");
          try {
            const intent = await readRouteIntent(request);
            if (intent.sport) setSport(intent.sport);
            if (intent.meters) setLength((intent.meters / 1000).toFixed(2));
            if (intent.uncertain)
              setError(
                "Choose one activity and distance using the controls below.",
              );
          } catch (e) {
            setError(userMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Segmented
        options={[
          { label: "Ride", value: "ride" },
          { label: "Run", value: "run" },
          { label: "Walk", value: "walk" },
          { label: "Hike", value: "hike" },
        ]}
        value={sport}
        onChange={setSport}
      />
      <Field
        label="Target distance · km"
        keyboardType="decimal-pad"
        value={length}
        onChangeText={setLength}
      />
      <Button
        title={
          supplied ? "Suggest loops in this area" : "Suggest loops around me"
        }
        loading={busy}
        onPress={() => void suggest()}
      />
      {!!error && <Notice text={error} />}
      <Txt>
        {popular
          ? "Suggestions include nearby community-popular cells where available."
          : "Suggestions use mapped connections around you. Community popularity will contribute when shared routes are available."}{" "}
        Distance varies with the paths available. Check crossings, signs and
        access before setting off.
      </Txt>
      {routes.map((route) => (
        <Card key={route.id}>
          <Txt size="heading" weight="700">
            {route.name}
          </Txt>
          <Txt mono>{km(route.distance)} km</Txt>
          <RouteMap points={route.points} height={220} />
          <Row>
            <Button
              title="Save route"
              onPress={() => {
                setBusy(true);
                void saveRoute(route)
                  .then(() => router.push("/routes"))
                  .catch((e) => setError(userMessage(e)))
                  .finally(() => setBusy(false));
              }}
              disabled={busy}
            />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

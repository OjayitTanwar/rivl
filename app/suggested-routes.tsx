import React, { useState } from "react";
import { Keyboard } from "react-native";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Button,
  Stack,
  SectionHeading,
  Empty,
  Metric,
  Field,
  Segmented,
  Notice,
  Row,
} from "../src/ui/primitives";
import { useTheme } from "../src/ui/theme";
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
  const { c } = useTheme();
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
    <Screen
      title="Suggested routes"
      back
      contentStyle={{ gap: 24, paddingBottom: 120 }}
    >
      <Stack gap={8}>
        <SectionHeading title="Find your next loop" />
        <Txt color={c.muted}>
          Choose an activity and target distance. We’ll look for mapped
          connections around your starting point.
        </Txt>
      </Stack>
      <Stack gap={12}>
        <Field
          label="Describe an activity and distance"
          value={request}
          onChangeText={setRequest}
          placeholder="A 5 km walk around me"
          maxLength={500}
        />
        <Button
          title="Use request"
          variant="quiet"
          style={{ alignSelf: "flex-start" }}
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
      </Stack>
      <Stack gap={16}>
        <SectionHeading title="Route preferences" />
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
          disabled={busy}
          onPress={() => void suggest()}
        />
      </Stack>
      {!!error && <Notice text={error} />}
      <Txt size="caption" color={c.muted}>
        {popular
          ? "Suggestions include nearby community-popular cells where available."
          : "Suggestions use mapped connections around you. Community popularity will contribute when shared routes are available."}{" "}
        Distance varies with the paths available. Check crossings, signs and
        access before setting off.
      </Txt>
      {!!routes.length && <SectionHeading title="Suggested loops" />}
      {!routes.length && !busy && !error && (
        <Empty
          title="Your route options appear here"
          body="Suggestions include a map and actual route distance. Save a loop to review it with your other routes."
        />
      )}
      {routes.map((route) => (
        <Stack
          key={route.id}
          gap={16}
          style={{
            paddingBottom: 24,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Txt size="heading" weight="700">
            {route.name}
          </Txt>
          <Metric
            small
            value={km(route.distance)}
            unit="km"
            label="Route distance"
          />
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
        </Stack>
      ))}
    </Screen>
  );
}

import React, { memo, useMemo, useState } from "react";
import { FlatList, View, Pressable } from "react-native";
import { router } from "expo-router";
import {
  MoreHorizontal,
  Plus,
  Download,
  Navigation,
  Map,
  Compass,
} from "lucide-react-native";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Row,
  Stack,
  Button,
  Empty,
  Field,
  Notice,
  ListRow,
  SectionHeading,
  Choice,
} from "../src/ui/primitives";
import { Trace } from "../src/ui/charts";
import type { RoutePlan, Sport } from "../src/domain/types";
import { km } from "../src/domain/format";
import { useTheme, brand } from "../src/ui/theme";
import { pickGPX, shareGPX } from "../src/services/gpx";
import { userMessage } from "../src/security/errors";

const sports: { label: string; value: Sport }[] = [
  { label: "Ride", value: "ride" },
  { label: "Run", value: "run" },
  { label: "Walk", value: "walk" },
  { label: "Hike", value: "hike" },
];
const RouteRow = memo(function RouteRow({ route }: { route: RoutePlan }) {
  const { c } = useTheme();
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  return (
    <Stack
      gap={12}
      style={{
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ backgroundColor: c.soft, borderRadius: 8, padding: 4 }}>
          <Trace points={route.points} size={76} />
        </View>
        <Stack gap={4} style={{ flex: 1 }}>
          <Txt size="subheading" weight="700">
            {route.name}
          </Txt>
          <Txt size="caption" color={c.muted}>
            {sports.find((sport) => sport.value === route.sport)?.label ??
              route.sport}
          </Txt>
          <Txt mono weight="600">
            {km(route.distance)} km
            {(route.routing === "recorded" || !route.routing) &&
            !route.surface.startsWith("CC BY 4.0")
              ? ` · ${Math.round(route.ascent)} m gain`
              : ""}
          </Txt>
        </Stack>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${route.name}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={({ pressed }) => ({
            minWidth: 48,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <MoreHorizontal size={22} color={c.text} />
        </Pressable>
      </Row>
      <Txt size="caption" color={c.muted}>
        {route.routing === "manual"
          ? "Direct line · paths not verified"
          : route.routing === "paths"
            ? "Mapped roads and paths"
            : route.surface}
      </Txt>
      <Row style={{ flexWrap: "wrap" }}>
        <Button
          title="Use route"
          style={{ flex: 1, minWidth: 120 }}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/record",
              params: { route: route.id },
            })
          }
        />
        <Button
          title="Navigate"
          variant="secondary"
          style={{ flex: 1, minWidth: 120 }}
          onPress={() =>
            router.push({ pathname: "/navigate", params: { route: route.id } })
          }
        />
      </Row>
      {expanded && (
        <Stack gap={0}>
          <ListRow
            title="Edit route"
            onPress={() =>
              router.push({
                pathname: "/route-planner",
                params: { id: route.id },
              })
            }
          />
          <ListRow
            title="Export GPX"
            onPress={() => {
              setError("");
              void shareGPX(
                route.surface.startsWith("CC BY 4.0")
                  ? `${route.name} | ${route.surface}`
                  : route.name,
                route.points,
              ).catch((e) => setError(userMessage(e)));
            }}
          />
        </Stack>
      )}
      {!!error && <Notice text={error} />}
    </Stack>
  );
});

export default function Routes() {
  const { routes, saveRoute } = useStore(),
    { c } = useTheme();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSport, setImportSport] = useState<Sport>("ride");
  const [toolsOpen, setToolsOpen] = useState(false);
  const filtered = useMemo(
    () =>
      routes.filter((route) =>
        `${route.name} ${route.sport} ${route.surface}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      ),
    [routes, query],
  );
  async function importRoute() {
    setImporting(true);
    setError("");
    try {
      const route = await pickGPX(importSport);
      if (route) {
        await saveRoute(route);
        setImportOpen(false);
      }
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setImporting(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={filtered}
        keyExtractor={(route) => route.id}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <Screen
            title="Routes"
            back
            scroll={false}
            contentStyle={{
              paddingBottom: 0,
              paddingHorizontal: 16,
              maxWidth: 800,
              gap: 20,
            }}
          >
            <Txt color={c.muted}>Your routes, ready for the next outing.</Txt>
            <Row style={{ flexWrap: "wrap" }}>
              <Button
                title="Create route"
                testID="plan-route"
                icon={<Plus size={19} color={brand.ink} />}
                style={{ flex: 1, minWidth: 140 }}
                onPress={() => router.push("/route-planner")}
              />
              <Button
                title="Import GPX"
                variant="secondary"
                icon={<Download size={19} color={c.text} />}
                style={{ flex: 1, minWidth: 140 }}
                onPress={() => setImportOpen(!importOpen)}
              />
            </Row>
            {importOpen && (
              <Stack
                gap={12}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: c.line,
                }}
              >
                <Choice
                  label="Route sport"
                  options={sports}
                  value={importSport}
                  onChange={setImportSport}
                />
                <Button
                  title="Choose GPX file"
                  variant="secondary"
                  loading={importing}
                  onPress={importRoute}
                />
              </Stack>
            )}
            {!!error && <Notice text={error} />}
            <Field
              label="Search routes"
              value={query}
              onChangeText={setQuery}
              placeholder="Name, sport, or surface"
              autoCapitalize="none"
            />
            <ListRow
              title="Shared routes"
              detail="Discover and publish community routes"
              onPress={() => router.push("/shared-routes")}
            />
            <SectionHeading title="Saved routes" />
          </Screen>
        }
        renderItem={({ item }) => (
          <View
            style={{
              paddingHorizontal: 16,
              width: "100%",
              maxWidth: 800,
              alignSelf: "center",
            }}
          >
            <RouteRow route={item} />
          </View>
        )}
        ListEmptyComponent={
          <View
            style={{
              paddingHorizontal: 16,
              width: "100%",
              maxWidth: 800,
              alignSelf: "center",
            }}
          >
            <Empty
              title={query ? "No matching routes" : "Save your first route"}
              body={
                query
                  ? "Try another name, sport, or surface."
                  : "Create a route on the map or import a GPX file. Saved routes appear here for recording and navigation."
              }
            />
          </View>
        }
        ListFooterComponent={
          <Stack
            gap={0}
            style={{
              paddingHorizontal: 16,
              paddingTop: 20,
              width: "100%",
              maxWidth: 800,
              alignSelf: "center",
            }}
          >
            <ListRow
              title={toolsOpen ? "Hide route tools" : "More route tools"}
              detail="Suggestions, navigation, and offline downloads"
              onPress={() => setToolsOpen(!toolsOpen)}
            />
            {toolsOpen && (
              <>
                <ListRow
                  title="Suggested routes"
                  icon={<Compass size={22} color={c.muted} />}
                  onPress={() => router.push("/suggested-routes")}
                />
                <ListRow
                  title="Navigate to a place"
                  icon={<Navigation size={22} color={c.muted} />}
                  onPress={() => router.push("/navigate")}
                />
                <ListRow
                  title="Offline maps & routes"
                  icon={<Map size={22} color={c.muted} />}
                  onPress={() => router.push("/offline-maps")}
                />
              </>
            )}
          </Stack>
        }
      />
    </View>
  );
}

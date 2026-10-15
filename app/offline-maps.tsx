import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { ChevronDown, Plus } from "lucide-react-native";
import { useStore } from "../src/state/store";
import {
  Screen,
  Stack,
  Txt,
  Button,
  Field,
  Notice,
  Row,
  SectionHeading,
  Segmented,
  Empty,
} from "../src/ui/primitives";
import RouteMap from "../src/ui/RouteMap";
import {
  offlineAreas,
  saveOfflineArea,
  removeOfflineArea,
  saveOfflineGuide,
  savedOfflineGuide,
  type OfflineArea,
} from "../src/services/offline-maps";
import { plannerLocation, searchPlace } from "../src/services/route-location";
import { useTheme } from "../src/ui/theme";
import { userMessage } from "../src/security/errors";

export default function OfflineMaps() {
  const { profile, routes, online } = useStore(),
    { c } = useTheme();
  const [areas, setAreas] = useState<OfflineArea[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [guides, setGuides] = useState<string[]>([]);
  const [section, setSection] = useState<"areas" | "directions">("areas");
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const reload = async () => {
    if (!profile) return;
    setAreas(await offlineAreas(profile.id));
    const saved = await Promise.all(
      routes.map(async (route) =>
        (await savedOfflineGuide(profile.id, route)) ? route.id : null,
      ),
    );
    setGuides(saved.filter((id): id is string => !!id));
  };
  useEffect(() => {
    void reload().catch((e) => setError(userMessage(e)));
  }, [profile?.id, routes]);
  const act = async (id: string, task: () => Promise<unknown>) => {
    setBusy(id);
    setError("");
    try {
      await task();
      await reload();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy("");
    }
  };
  const rowStyle = {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    gap: 12,
  };
  return (
    <Screen title="Offline maps & routes" back contentStyle={{ gap: 24 }}>
      <Txt color={c.muted}>
        Download paths and route directions before you go.
      </Txt>
      <Txt size="caption" color={c.muted}>
        Google map previews require a connection. Downloads store road and path
        geometry for guidance; they do not include a Google basemap.
      </Txt>
      {!!error && <Notice text={error} />}
      {!online && (
        <Txt size="caption" color={c.muted}>
          Offline · saved paths and directions remain on this device. Connect to
          download or refresh.
        </Txt>
      )}
      <Segmented
        options={[
          { label: "Saved areas", value: "areas" },
          { label: "Route directions", value: "directions" },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === "areas" ? (
        <Stack gap={20}>
          <Button
            title={adding ? "Close area form" : "Save an area"}
            variant="secondary"
            icon={<Plus size={20} color={c.text} />}
            onPress={() => setAdding(!adding)}
          />
          {adding && (
            <Stack
              gap={16}
              style={{
                paddingBottom: 20,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <SectionHeading title="Download nearby paths" />
              <Txt size="caption" color={c.muted}>
                Save road and path geometry within 1.2 km of a place. Up to five
                areas can be stored.
              </Txt>
              <Field
                label="Place or latitude, longitude"
                value={query}
                onChangeText={setQuery}
                placeholder="Leave blank for your current location"
              />
              <Button
                title="Download paths"
                loading={busy === "area"}
                disabled={!profile || !!busy || !online}
                onPress={() =>
                  act("area", async () => {
                    const center = query.trim()
                      ? (await searchPlace(query))[0]
                      : await plannerLocation();
                    if (!center)
                      throw new Error(
                        "No matching place found. Try another name or coordinates.",
                      );
                    await saveOfflineArea(
                      profile!.id,
                      query || "Around me",
                      center,
                    );
                    setAdding(false);
                    setQuery("");
                  })
                }
              />
            </Stack>
          )}
          {!areas.length && !adding && (
            <Empty
              title="No saved areas"
              body="Save paths around a place while connected. Your downloaded areas will appear here."
            />
          )}
          {areas.map((area) => (
            <Stack key={area.id} style={rowStyle}>
              <Txt size="subheading" weight="700">
                {area.name}
              </Txt>
              <Txt size="caption" color={c.muted}>
                Downloaded {new Date(area.downloadedAt).toLocaleDateString()} ·{" "}
                {area.lines.length} road/path lines
                {area.limited ? " · partial coverage" : ""}
              </Txt>
              <Row style={{ flexWrap: "wrap" }}>
                <Button
                  title={preview === area.id ? "Hide paths" : "Preview paths"}
                  variant="secondary"
                  icon={<ChevronDown size={18} color={c.text} />}
                  onPress={() =>
                    setPreview(preview === area.id ? null : area.id)
                  }
                />
                <Button
                  title="Remove area"
                  variant="danger"
                  loading={busy === area.id}
                  disabled={!!busy || !profile}
                  onPress={() =>
                    act(area.id, () => removeOfflineArea(profile!.id, area.id))
                  }
                />
              </Row>
              {preview === area.id && (
                <RouteMap
                  points={area.lines.flat()}
                  lines={[]}
                  network={area.lines}
                  height={240}
                />
              )}
              <Txt size="caption" color={c.muted}>
                © OpenStreetMap contributors · ODbL
              </Txt>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Stack gap={16}>
          <SectionHeading title="Saved route directions" />
          <Txt size="caption" color={c.muted}>
            Download while online, then start near the route’s first point.
            Spoken turns work offline; saved connected paths can support limited
            rerouting. GPS and voice permissions are still required.
          </Txt>
          {!routes.length && (
            <Empty
              title="No routes to download"
              body="Create or import a route first, then download its directions here."
              action={
                <Button
                  title="Open routes"
                  variant="secondary"
                  onPress={() => router.push("/routes")}
                />
              }
            />
          )}
          {routes.map((route) => (
            <Stack key={route.id} style={rowStyle}>
              <Txt size="subheading" weight="700">
                {route.name}
              </Txt>
              {guides.includes(route.id) && (
                <Txt size="caption" color={c.good}>
                  Directions available offline
                </Txt>
              )}
              {(route.routing === "manual" || route.points.length < 2) && (
                <Txt size="caption" color={c.muted}>
                  Find mapped paths in the route planner before downloading
                  directions.
                </Txt>
              )}
              <Button
                title={
                  guides.includes(route.id)
                    ? "Refresh directions"
                    : "Download directions"
                }
                variant={guides.includes(route.id) ? "secondary" : "primary"}
                loading={busy === route.id}
                disabled={
                  !!busy ||
                  !profile ||
                  !online ||
                  route.routing === "manual" ||
                  route.points.length < 2
                }
                style={{ alignSelf: "flex-start" }}
                onPress={() =>
                  act(route.id, () => saveOfflineGuide(profile!.id, route))
                }
              />
            </Stack>
          ))}
        </Stack>
      )}
    </Screen>
  );
}

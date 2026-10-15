import React, { useMemo, useRef, useState } from "react";
import { Image, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { captureRef, releaseCapture } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Share2,
  Gauge,
  Timer,
  Mountain,
  Route,
} from "lucide-react-native";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Row,
  Button,
  Segmented,
  Notice,
} from "../src/ui/primitives";
import { brand, useTheme } from "../src/ui/theme";
import { RivlLogo } from "../src/ui/RivlLogo";
import {
  km,
  pace,
  duration,
  speed,
  speedLabel,
  type SpeedUnit,
} from "../src/domain/format";
import { redactRoute } from "../src/domain/geo";
import { routePreviewPath } from "../src/domain/route-preview";
import { explorationProgress } from "../src/domain/exploration";
import { userMessage } from "../src/security/errors";
export default function Story() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { activities, profile } = useStore(),
    { c } = useTheme();
  const activity = activities.find((a) => a.id === id);
  const ref = useRef<View>(null);
  const width = Math.min(360, useWindowDimensions().width - 44);
  const [layout, setLayout] = useState("story"),
    [style, setStyle] = useState("signal"),
    [photo, setPhoto] = useState<string | null>(null),
    [unit, setUnit] = useState<SpeedUnit>(profile?.speedUnit ?? "kmh"),
    [error, setError] = useState("");
  const progress = useMemo(() => explorationProgress(activities), [activities]);
  const styles = progress.rewards
    .filter((r) => r.style && r.unlocked)
    .map((r) => ({
      label:
        r.style === "signal"
          ? "Signal"
          : r.style === "terrain"
            ? "Terrain"
            : "Night",
      value: r.style!,
    }));
  if (!activity)
    return (
      <Screen title="Activity story" back>
        <Txt>Record an activity to make your story.</Txt>
      </Screen>
    );
  const route = redactRoute(
    activity.route,
    profile?.privacyZones ?? [],
  ).flatMap((line, segment) => line.map((p) => ({ ...p, segment })));
  const foreground =
    layout === "overlay" || photo || style === "night" ? brand.warm : brand.ink;
  const background =
    layout === "overlay"
      ? "transparent"
      : style === "night"
        ? brand.ink
        : style === "terrain"
          ? brand.warm
          : brand.coral;
  const s = activity.summary;
  async function share() {
    let uri: string | undefined;
    try {
      setError("");
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("Image sharing is unavailable on this device.");
      uri = await captureRef(ref, {
        format: "png",
        quality: 1,
        width: 1080,
        height: 1920,
        result: "tmpfile",
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle:
          layout === "overlay"
            ? "Share transparent workout overlay"
            : "Share workout story",
      });
    } catch (e) {
      setError(userMessage(e));
    } finally {
      if (uri) releaseCapture(uri);
    }
  }
  return (
    <Screen title="Make your story" subtitle="Your route. Your effort." back>
      <Segmented
        options={[
          { label: "Story", value: "story" },
          { label: "Transparent overlay", value: "overlay" },
        ]}
        value={layout}
        onChange={setLayout}
      />
      <Segmented options={styles} value={style} onChange={setStyle} />
      <Segmented
        options={[
          { label: "km/h", value: "kmh" as const },
          { label: "mph", value: "mph" as const },
        ]}
        value={unit}
        onChange={setUnit}
      />
      <View
        style={{
          alignItems: "center",
          backgroundColor: layout === "overlay" ? brand.ink : c.soft,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <View
          ref={ref}
          collapsable={false}
          style={{
            width,
            height: (width * 16) / 9,
            backgroundColor: background,
            padding: 24,
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          {photo && layout !== "overlay" && (
            <>
              <Image
                source={{ uri: photo }}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                }}
                resizeMode="cover"
              />
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: brand.ink,
                  opacity: 0.55,
                }}
              />
            </>
          )}
          <Row>
            <RivlLogo size={40} background={false} color={foreground} />
            <Txt
              color={foreground}
              weight="900"
              size="heading"
              style={{ fontStyle: "italic" }}
            >
              RIVL
            </Txt>
          </Row>
          <View style={{ gap: 10 }}>
            <Txt
              size="heading"
              color={foreground}
              weight="700"
              numberOfLines={3}
            >
              {activity.title}
            </Txt>
            <Txt size="caption" color={foreground}>
              {new Date(activity.startedAt).toLocaleDateString()} ·{" "}
              {activity.sport === "ride"
                ? "Cycling"
                : activity.sport === "run"
                  ? "Running"
                  : activity.sport === "hike"
                    ? "Hiking"
                    : "Walking"}
            </Txt>
          </View>
          <Svg width="100%" height={width * 0.52} viewBox="0 0 300 180">
            <Path
              d={routePreviewPath(route, 300, 180)}
              fill="none"
              stroke={foreground}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <View style={{ gap: 18 }}>
            <Row style={{ flexWrap: "wrap" }}>
              {[
                { value: km(s.distance, 2), label: "km", Icon: Route },
                {
                  value: duration(s.moving),
                  label: "moving time",
                  Icon: Timer,
                },
              ].map((m) => (
                <View key={m.label} style={{ flex: 1, minWidth: 105, gap: 4 }}>
                  <m.Icon size={18} color={foreground} />
                  <Txt color={foreground} size="heading" mono weight="800">
                    {m.value}
                  </Txt>
                  <Txt color={foreground} size="caption">
                    {m.label}
                  </Txt>
                </View>
              ))}
            </Row>
            <Row style={{ flexWrap: "wrap" }}>
              {[
                { value: pace(s.avgPace), label: "/km pace", Icon: Timer },
                {
                  value: speed(s.avgSpeed, unit),
                  label: speedLabel(unit),
                  Icon: Gauge,
                },
                {
                  value: Math.round(s.ascent).toString(),
                  label: "m climbed",
                  Icon: Mountain,
                },
              ].map((m) => (
                <View key={m.label} style={{ flex: 1, minWidth: 72, gap: 4 }}>
                  <m.Icon size={16} color={foreground} />
                  <Txt color={foreground} size="subheading" mono weight="700">
                    {m.value}
                  </Txt>
                  <Txt color={foreground} size="caption">
                    {m.label}
                  </Txt>
                </View>
              ))}
            </Row>
          </View>
        </View>
      </View>
      {layout === "story" && (
        <Row>
          <Button
            title={photo ? "Change photo" : "Add a photo"}
            variant="secondary"
            icon={<Camera size={18} color={c.text} />}
            onPress={async () => {
              const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!p.granted)
                throw new Error("Allow Photos access to choose a background.");
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 1,
              });
              if (!result.canceled) setPhoto(result.assets[0]!.uri);
            }}
          />
          {photo && (
            <Button
              title="Remove"
              variant="quiet"
              onPress={() => setPhoto(null)}
            />
          )}
        </Row>
      )}
      <Txt size="caption" color={c.muted}>
        Start, finish, and privacy zones are hidden from the route graphic.
        Overlay exports keep a transparent background; add them over a photo in
        your story editor.
      </Txt>
      {!!error && <Notice text={error} />}
      <Button
        title={layout === "overlay" ? "Share overlay PNG" : "Share story"}
        icon={<Share2 size={18} color={brand.ink} />}
        onPress={share}
      />
    </Screen>
  );
}

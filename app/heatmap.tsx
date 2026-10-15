import React, { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Check, Lock } from "lucide-react-native";
import { explorationProgress } from "../src/domain/exploration";
import { XPBar } from "../src/ui/ExplorationCard";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Stack,
  SectionHeading,
  Segmented,
  Metric,
  Row,
  Empty,
} from "../src/ui/primitives";
import HeatmapMap from "../src/ui/HeatmapMap";
import { heatmapCells } from "../src/domain/heatmap";
import { popularCells } from "../src/services/popularity";
import { plannerLocation } from "../src/services/route-location";
import { Button, Notice } from "../src/ui/primitives";
import { userMessage } from "../src/security/errors";
import { routeLines } from "../src/domain/geo";
import { km } from "../src/domain/format";
import { useTheme } from "../src/ui/theme";
import { supabase } from "../src/services/supabase";
export default function Heatmap() {
  const { activities, session, online } = useStore(),
    { c } = useTheme(),
    [period, setPeriod] = useState("year"),
    [mode, setMode] = useState("personal"),
    [global, setGlobal] = useState<
      { lat: number; lng: number; visits: number }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const filtered = useMemo(
      () =>
        activities.filter(
          (a) =>
            !a.demo &&
            !a.simulated &&
            (period === "all" ||
              a.startedAt >
                Date.now() - (period === "month" ? 30 : 365) * 86400000),
        ),
      [activities, period],
    ),
    lines = useMemo(
      () => filtered.flatMap((a) => routeLines(a.route)),
      [filtered],
    ),
    points = useMemo(() => lines.flat(), [lines]);
  const totals = useMemo(
    () =>
      mode === "explore"
        ? activities.filter((activity) => !activity.demo && !activity.simulated)
        : filtered,
    [activities, filtered, mode],
  );
  const progress = useMemo(() => explorationProgress(activities), [activities]);
  const request = useRef(0);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    ++request.current;
    setGlobal([]);
    setSearched(false);
    setError("");
    setBusy(false);
  }, [period]);
  const canSearch = Boolean(session && !session.local && supabase && online);
  const sectionStyle = {
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: c.line,
    gap: 16,
  };
  return (
    <Screen title="Heatmap" back>
      <Segmented
        options={[
          { label: "Explore", value: "explore" },
          { label: "Personal", value: "personal" },
          { label: "Community", value: "community" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode !== "explore" && (
        <Segmented
          options={[
            { label: "Month", value: "month" },
            { label: "Year", value: "year" },
            { label: "All time", value: "all" },
          ]}
          value={period}
          onChange={setPeriod}
        />
      )}
      {mode === "community" && (
        <>
          <Button
            title="Find popular paths around me"
            loading={busy}
            disabled={!canSearch}
            onPress={async () => {
              const sequence = ++request.current;
              setBusy(true);
              setError("");
              try {
                const center = await plannerLocation();
                const cells = await popularCells(
                  center,
                  "ride",
                  period === "all"
                    ? 0
                    : Date.now() - (period === "month" ? 30 : 365) * 86400000,
                );
                if (sequence === request.current) {
                  setGlobal(cells);
                  setSearched(true);
                }
              } catch (e) {
                if (sequence === request.current) setError(userMessage(e));
              } finally {
                if (sequence === request.current) setBusy(false);
              }
            }}
          />
          <Txt size="caption" color={c.muted}>
            Community density uses public cycling routes around your current
            location. A cell appears only after at least three athletes visit
            it.
          </Txt>
          {!canSearch && (
            <Txt size="caption" color={c.muted}>
              {!online
                ? "Connect to the internet to search community paths."
                : "Community paths require a cloud account and a configured community service. Your personal heatmap is available on this device."}
            </Txt>
          )}
        </>
      )}
      {!!error && <Notice text={error} />}
      {mode === "community" && (
        <Txt size="caption" color={c.muted}>
          Coarse public-route density. Private activities, hidden content and
          blocked athletes are excluded.
        </Txt>
      )}
      {(
        mode === "explore"
          ? progress.tiles.length
          : mode === "personal"
            ? points.length
            : global.length
      ) ? (
        <HeatmapMap
          key={mode + period + global.length}
          tiles={mode === "explore" ? progress.tiles : undefined}
          cells={
            mode === "explore"
              ? progress.tiles
              : mode === "personal"
                ? heatmapCells(filtered.map((a) => a.route))
                : global
          }
        />
      ) : (
        <Empty
          title={
            mode !== "community"
              ? "No recorded routes in this view"
              : searched
                ? "No community coverage found"
                : "Find community paths"
          }
          body={
            mode !== "community"
              ? "Recorded routes will build your personal map here."
              : searched
                ? "Shared routes must meet the privacy threshold before a cell appears. Try another period."
                : "Search nearby while online to see public cycling routes."
          }
        />
      )}
      {mode === "explore" && (
        <Stack style={sectionStyle}>
          <SectionHeading title="Exploration progress" />
          <Row style={{ flexWrap: "wrap" }}>
            <Metric
              small
              value={String(progress.tiles.length)}
              label="Tiles explored"
            />
            <Metric small value={String(progress.level)} label="Level" />
            <Metric small value={String(progress.xp)} label="XP earned" />
          </Row>
          <XPBar value={progress.levelProgress} />
          <Txt color={c.muted}>
            New 150 m tiles earn 10 XP. Activities earn 20 XP, with a small
            climbing bonus. Explore at your own pace.
          </Txt>
          <Txt size="caption" color={c.muted}>
            Green: visited once. Coral: familiar ground. Your exploration map
            stays private.
          </Txt>
        </Stack>
      )}
      {mode === "explore" && (
        <>
          <Stack style={sectionStyle}>
            <SectionHeading title="This week’s quests" />
            {progress.missions.map((m) => (
              <View key={m.title} style={{ gap: 8 }}>
                <Row between>
                  <Txt weight="600" style={{ flex: 1 }}>
                    {m.title}
                  </Txt>
                  {m.value >= m.target && <Check size={20} color={c.good} />}
                </Row>
                <XPBar value={Math.min(1, m.value / m.target)} />
                <Txt size="caption" color={c.muted}>
                  {Math.min(m.value, m.target)} / {m.target} {m.unit}
                </Txt>
              </View>
            ))}
          </Stack>
          <Stack style={sectionStyle}>
            <SectionHeading title="Rewards" />
            {progress.rewards.map((r) => (
              <Row
                key={r.title}
                style={{ alignItems: "flex-start", flexWrap: "wrap" }}
              >
                <View style={{ width: 32 }}>
                  {r.unlocked ? (
                    <Check size={22} color={c.good} />
                  ) : (
                    <Lock size={20} color={c.muted} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 150, gap: 3 }}>
                  <Txt weight="600">{r.title}</Txt>
                  <Txt size="caption" color={c.muted}>
                    {r.detail} · {r.tiles} tiles
                  </Txt>
                </View>
                <Txt size="caption" color={r.unlocked ? c.good : c.muted}>
                  {r.unlocked
                    ? "Earned"
                    : `${Math.max(0, r.tiles - progress.tiles.length)} to go`}
                </Txt>
              </Row>
            ))}
            <Txt size="caption" color={c.muted}>
              Rewards add story styles and badges. Core training and navigation
              always stay available.
            </Txt>
          </Stack>
        </>
      )}
      {mode !== "community" && (
        <Stack style={sectionStyle}>
          <Row style={{ flexWrap: "wrap" }}>
            <Metric small value={totals.length.toString()} label="Activities" />
            <Metric
              small
              value={km(totals.reduce((s, a) => s + a.summary.distance, 0))}
              unit="km"
              label="Ground covered"
            />
          </Row>
          <Txt color={c.muted}>
            Only visible to you. This map includes your full private routes.
            Colour reflects visits per activity, not GPS sampling frequency.
          </Txt>
        </Stack>
      )}
    </Screen>
  );
}

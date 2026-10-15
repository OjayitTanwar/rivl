import React, { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { useStore } from "../src/state/store";
import { Screen, Txt, Field, Empty, Segmented } from "../src/ui/primitives";
import { ActivityRow } from "../src/ui/ActivityRow";
import { useTheme } from "../src/ui/theme";
export default function History() {
  const { activities } = useStore(),
    { c } = useTheme(),
    [q, setQ] = useState(""),
    [sport, setSport] = useState("all");
  const rows = useMemo(
    () =>
      activities.filter(
        (a) =>
          (sport === "all" || sport === a.sport) &&
          (a.title.toLowerCase().includes(q.toLowerCase()) ||
            new Date(a.startedAt).toLocaleDateString().includes(q)),
      ),
    [activities, q, sport],
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListHeaderComponent={
          <Screen
            scroll={false}
            title="Activities"
            contentStyle={{ paddingBottom: 16 }}
            back
          >
            <Field
              label="Search activities"
              placeholder="Title or date"
              value={q}
              onChangeText={setQ}
            />
            <Segmented
              options={["all", "run", "ride", "walk", "hike"].map((s) => ({
                value: s,
                label: s[0]!.toUpperCase() + s.slice(1),
              }))}
              value={sport}
              onChange={setSport}
            />
            <Txt>{rows.length} activities</Txt>
          </Screen>
        }
        renderItem={({ item }) => (
          <View
            style={{
              paddingHorizontal: 24,
              width: "100%",
              maxWidth: 1050,
              alignSelf: "center",
            }}
          >
            <ActivityRow activity={item} />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Empty
              title="Nothing here yet"
              body="Your recorded activities will appear here. Try a different search if you have already logged a workout."
            />
          </View>
        }
        contentContainerStyle={{ paddingBottom: 50 }}
      />
    </View>
  );
}

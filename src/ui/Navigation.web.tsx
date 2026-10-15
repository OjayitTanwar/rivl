import React from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { Slot, router, usePathname } from "expo-router";
import {
  House,
  Map,
  CircleDot,
  Users,
  Settings,
  ArrowUpRight,
} from "lucide-react-native";
import { brand, useTheme } from "./theme";
import { Txt, Stack, Row, Pill } from "./primitives";
import { useStore } from "../state/store";
import { initials } from "../domain/format";
import { Trace } from "./charts";
const tabs = [
  { path: "/", name: "Home", Icon: House },
  { path: "/maps", name: "Maps", Icon: Map },
  { path: "/record", name: "Record", Icon: CircleDot },
  { path: "/community", name: "Groups", Icon: Users },
] as const;
export default function Navigation() {
  const { width } = useWindowDimensions(),
    wide = width >= 1000,
    { c } = useTheme(),
    path = usePathname(),
    { profile, session } = useStore();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: wide ? "row" : "column",
        backgroundColor: c.bg,
      }}
    >
      {wide && (
        <View
          style={{
            width: 224,
            borderRightWidth: 1,
            borderRightColor: c.line,
            padding: 24,
            gap: 38,
          }}
        >
          <Row>
            <Txt
              size="title"
              weight="900"
              style={{ fontStyle: "italic", letterSpacing: -1.3 }}
            >
              RIVL
            </Txt>
            <View
              style={{
                width: 8,
                height: 8,
                backgroundColor: brand.coral,
                borderRadius: 4,
                alignSelf: "flex-end",
                marginBottom: 10,
              }}
            />
          </Row>
          <Stack gap={8}>
            {tabs.map(({ path: p, name, Icon }) => (
              <Pressable
                key={p}
                accessibilityRole="tab"
                accessibilityLabel={name}
                accessibilityState={{ selected: path === p }}
                onPress={() => router.navigate(p)}
                style={{
                  flexDirection: "row",
                  gap: 14,
                  alignItems: "center",
                  minHeight: 52,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: path === p ? c.surface : "transparent",
                }}
              >
                <Icon size={21} color={path === p ? c.accent : c.muted} />
                <Txt
                  weight={path === p ? "700" : "500"}
                  color={path === p ? c.text : c.muted}
                >
                  {name}
                </Txt>
              </Pressable>
            ))}
          </Stack>
          <View style={{ flex: 1 }} />
          <Stack gap={4}>
            <Trace size={85} color={c.muted} />
            <Txt size="caption" weight="600">
              Your work. Your data.
            </Txt>
            <Txt size="micro" color={c.muted}>
              Everything you need to go further.
            </Txt>
          </Stack>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push("/settings")}
          >
            <Row>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "#D8E8D6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt size="caption" weight="700" color={brand.ink}>
                  {initials(profile?.name ?? "Athlete")}
                </Txt>
              </View>
              <Stack gap={2} style={{ flex: 1 }}>
                <Txt size="caption" weight="700">
                  {profile?.name}
                </Txt>
                <Txt size="micro" color={c.muted}>
                  {session?.demo ? "Demo athlete" : "Athlete"}
                </Txt>
              </Stack>
              <Settings size={17} color={c.muted} />
            </Row>
          </Pressable>
        </View>
      )}
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Slot />
      </View>
      {!wide && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: c.nav,
            borderTopWidth: 1,
            borderTopColor: c.line,
            paddingBottom: 14,
            paddingTop: 9,
            flexDirection: "row",
            justifyContent: "space-around",
          }}
        >
          {tabs.map(({ path: p, name, Icon }) => (
            <Pressable
              key={p}
              accessibilityRole="tab"
              accessibilityLabel={name}
              accessibilityState={{ selected: path === p }}
              onPress={() => router.navigate(p)}
              style={{
                minWidth: 58,
                minHeight: 52,
                alignItems: "center",
                gap: 5,
                justifyContent: "center",
              }}
            >
              <Icon
                size={23}
                strokeWidth={path === p ? 2.4 : 1.7}
                color={path === p ? c.accent : c.muted}
              />
              <Txt
                size="micro"
                weight={path === p ? "700" : "500"}
                color={path === p ? c.accent : c.muted}
              >
                {name}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

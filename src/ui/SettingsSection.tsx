import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Row, Stack, Txt } from "./primitives";
import { useTheme } from "./theme";

/** Flat, individually discoverable groups for lower-frequency settings/tasks. */
export function SettingsSection({
  title,
  children,
  collapsible = false,
  initiallyOpen = false,
  keepMounted = false,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  initiallyOpen?: boolean;
  keepMounted?: boolean;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 12 }}>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Row between>
            <Txt weight="600">{title}</Txt>
            {open ? (
              <ChevronDown size={20} color={c.muted} />
            ) : (
              <ChevronRight size={20} color={c.muted} />
            )}
          </Row>
        </Pressable>
      ) : (
        <Txt weight="600" style={{ paddingVertical: 12 }}>
          {title}
        </Txt>
      )}
      {(!collapsible || open || keepMounted) && (
        <Stack gap={16} style={{ paddingBottom: 12, ...(collapsible && !open ? { display: "none" } : {}) }}>
          {children}
        </Stack>
      )}
    </View>
  );
}

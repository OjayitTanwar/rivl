import React from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useStore } from "../state/store";
import { setBlocked } from "../services/safety";
import { Ellipsis } from "lucide-react-native";
import { useTheme } from "./theme";
import { Button, IconButton } from "./primitives";
import { userMessage } from "../security/errors";
export function SafetyActions({
  id,
  owner,
  name,
  kind = "activity",
  compact = false,
}: {
  id: string;
  owner?: string;
  name: string;
  kind?: "activity" | "comment";
  compact?: boolean;
}) {
  const { session, refresh } = useStore();
  const { c } = useTheme();
  if (!session || owner === session.userId) return null;
  const open = () => {
    if (kind === "comment") {
      router.push({ pathname: "/report", params: { kind, target: id } });
      return;
    }
    Alert.alert(name, "Manage what you see in RIVL.", [
      {
        text: "Report activity",
        onPress: () =>
          router.push({ pathname: "/report", params: { kind, target: id } }),
      },
      ...(owner
        ? [
            {
              text: "Block athlete",
              style: "destructive" as const,
              onPress: () =>
                Alert.alert(
                  "Block this athlete?",
                  "Their shared activities and interactions will be hidden.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Block",
                      style: "destructive",
                      onPress: () => {
                        void setBlocked(session, owner, true)
                          .then(refresh)
                          .catch((error) =>
                            Alert.alert(
                              "Couldn’t block athlete",
                              userMessage(error),
                            ),
                          );
                      },
                    },
                  ],
                ),
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  };
  return compact ? (
    <IconButton label="Activity options" onPress={open}>
      <Ellipsis size={21} color={c.muted} />
    </IconButton>
  ) : (
    <Button
      title={kind === "comment" ? "Report comment" : "Activity options"}
      variant="quiet"
      onPress={open}
    />
  );
}

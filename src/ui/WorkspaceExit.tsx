import React from "react";
import { router } from "expo-router";
import { Button } from "./primitives";

/** Return to the main app without changing recording or workspace records. */
export function WorkspaceExit() {
  return (
    <Button
      title="RIVL"
      variant="quiet"
      onPress={() => router.dismissTo("/")}
    />
  );
}

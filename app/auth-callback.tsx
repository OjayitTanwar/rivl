import React, { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/state/store";
import { Screen, Notice, Button } from "../src/ui/primitives";
import { userMessage } from "../src/security/errors";
import { useTheme } from "../src/ui/theme";
export default function AuthCallback() {
  const { code, error: providerError } = useLocalSearchParams<{
      code?: string;
      error?: string;
    }>(),
    { completeProviderSignIn } = useStore(),
    { c } = useTheme(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!code || providerError) {
      setError("Sign-in was interrupted. Please try again.");
      return;
    }
    void completeProviderSignIn(code)
      .then(() => {
        if (active) router.replace("/");
      })
      .catch((e) => {
        if (active) setError(userMessage(e));
      });
    return () => {
      active = false;
    };
  }, [code, providerError]);
  return (
    <Screen title="Finishing sign-in">
      {error ? (
        <>
          <Notice text={error} />
          <Button
            title="Back to sign in"
            onPress={() => router.replace("/auth")}
          />
        </>
      ) : (
        <ActivityIndicator
          accessibilityLabel="Finishing sign-in"
          color={c.accent}
        />
      )}
    </Screen>
  );
}

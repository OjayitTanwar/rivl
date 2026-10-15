import React, { useCallback, useEffect, useMemo, useReducer } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingContext } from "./loading-state";
import { LoadingJourney } from "./LoadingJourney";
import { Button, Txt } from "./primitives";
import { useTheme } from "./theme";
import { loadingJobs, visibleLoadingJobs } from "../domain/loading-jobs";

export function FullScreenLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  const [state, dispatch] = useReducer(loadingJobs, {
    jobs: new Map<symbol, string>(),
    dismissed: new Set<symbol>(),
  });
  const { dismissed } = state;
  const begin = useCallback((id: symbol, label: string) => {
    dispatch({ type: "begin", id, label });
    return () => dispatch({ type: "end", id });
  }, []);
  const update = useCallback(
    (id: symbol, label: string, foreground: boolean) => {
      dispatch({ type: "update", id, label, foreground });
    },
    [],
  );
  const context = useMemo(
    () => ({ begin, update, dismissed }),
    [begin, update, dismissed],
  );
  const visible = visibleLoadingJobs(state);
  const covered = visible.length > 0;
  const continueLoading = useCallback(() => dispatch({ type: "continue" }), []);
  useEffect(() => {
    if (!covered || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        continueLoading();
        return true;
      },
    );
    return () => subscription.remove();
  }, [covered, continueLoading]);
  // Keep loading outside UIKit presentation transitions; unmounting removes
  // its touch surface immediately rather than waiting for modal dismissal.
  const overlay = covered ? (
    <SafeAreaView
      style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, zIndex: 1000 }]}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          gap: 20,
        }}
      >
        <LoadingJourney
          large
          label={visible[0]?.[1] ?? state.lastLabel ?? "Getting things ready…"}
        />
        <Txt color={c.muted} size="caption" style={{ textAlign: "center" }}>
          You can keep exploring while this finishes.
        </Txt>
      </View>
      <View style={{ padding: 24 }}>
        <Button
          title="Continue while it loads"
          variant="secondary"
          onPress={continueLoading}
        />
      </View>
    </SafeAreaView>
  ) : null;
  return (
    <LoadingContext.Provider value={context}>
      <View style={{ flex: 1 }}>
        <View
          style={{ flex: 1 }}
          accessibilityElementsHidden={covered}
          importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
          pointerEvents={covered ? "none" : "auto"}
        >
          {children}
        </View>
        {covered &&
          (Platform.OS === "ios" ? (
            <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
              {overlay}
            </FullWindowOverlay>
          ) : (
            overlay
          ))}
      </View>
    </LoadingContext.Provider>
  );
}

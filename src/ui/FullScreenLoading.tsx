import React, { useCallback, useMemo, useReducer } from "react";
import { Modal, View } from "react-native";
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
  const { c, reduceMotion } = useTheme();
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
  const continueLoading = () => dispatch({ type: "continue" });
  return (
    <LoadingContext.Provider value={context}>
      {children}
      <Modal
        visible={visible.length > 0}
        animationType={reduceMotion ? "none" : "fade"}
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={continueLoading}
        statusBarTranslucent
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: c.bg }}
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
              label={
                visible[0]?.[1] ?? state.lastLabel ?? "Getting things ready…"
              }
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
      </Modal>
    </LoadingContext.Provider>
  );
}

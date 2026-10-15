import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { NavigationContext } from "@react-navigation/native";
export const LoadingContext = createContext<{
  begin: (id: symbol, label: string) => () => void;
  update: (id: symbol, label: string, foreground: boolean) => void;
  dismissed: ReadonlySet<symbol>;
} | null>(null);
/** Visibility follows focus; request identity and Continue survive blur/refocus. */
export function useFullScreenLoading(active: boolean, label: string) {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!navigation) return () => {};
      const focus = navigation.addListener("focus", callback);
      const blur = navigation.addListener("blur", callback);
      return () => {
        focus();
        blur();
      };
    },
    [navigation],
  );
  const getFocused = useCallback(
    () => navigation?.isFocused() ?? true,
    [navigation],
  );
  const focused = useSyncExternalStore(subscribe, getFocused, getFocused);
  const context = useContext(LoadingContext);
  const id = useRef(Symbol("loading")).current;
  const latestLabel = useRef(label);
  latestLabel.current = label;
  const begin = context?.begin;
  const update = context?.update;
  useEffect(() => {
    if (active && begin) return begin(id, latestLabel.current);
  }, [active, begin, id]);
  useEffect(() => {
    if (active) update?.(id, label, focused);
  }, [active, update, id, label, focused]);
  return active && focused && !!context && !context.dismissed.has(id);
}

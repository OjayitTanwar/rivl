import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AccessibilityInfo, Platform, useColorScheme } from "react-native";
import { useStore } from "../state/store";
import { accentColors } from "../domain/appearance";
export { brand } from "./brand";
const light = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  text: "#101114",
  muted: "#676A68",
  line: "#E3E3DA",
  soft: "#F5F4EF",
  accent: "#BC2D1D",
  primary: "#FF4B35",
  good: "#197344",
  blue: "#1267A3",
  nav: "#FFFFFF",
  dark: false,
};
const dark = {
  bg: "#101114",
  surface: "#1D1F22",
  text: "#F5F4EF",
  muted: "#A5AAA7",
  line: "#35373A",
  soft: "#292C2D",
  accent: "#FF705B",
  primary: "#FF4B35",
  good: "#45DF8A",
  blue: "#3BA7FF",
  nav: "#17181B",
  dark: true,
};
type Theme = typeof light;
const Context = createContext({
  c: light,
  reduceMotion: false,
  reduceTransparency: false,
  contrast: false,
});
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useStore(),
    scheme = useColorScheme(),
    [reduceMotion, setMotion] = useState(false),
    [reduceTransparency, setTransparency] = useState(false),
    [contrast, setContrast] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setMotion);
    if (AccessibilityInfo.isReduceTransparencyEnabled)
      void AccessibilityInfo.isReduceTransparencyEnabled().then(
        setTransparency,
      );
    if (Platform.OS === "ios")
      void AccessibilityInfo.isDarkerSystemColorsEnabled().then(setContrast);
    else if (AccessibilityInfo.isHighTextContrastEnabled)
      void AccessibilityInfo.isHighTextContrastEnabled().then(setContrast);
    const a = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setMotion,
      ),
      contrastChange = AccessibilityInfo.addEventListener(
        Platform.OS === "ios"
          ? "darkerSystemColorsChanged"
          : "highTextContrastChanged",
        setContrast,
      ),
      b = AccessibilityInfo.addEventListener(
        "reduceTransparencyChanged",
        setTransparency,
      );
    return () => {
      a.remove();
      b.remove();
      contrastChange.remove();
    };
  }, []);
  const c = (
    profile?.theme === "system" || !profile?.theme
      ? scheme === "dark"
      : profile.theme === "dark"
  )
    ? dark
    : light;
  const highContrast = Boolean(profile?.highContrast || contrast);
  const palette = accentColors[profile?.accentColor ?? "orange"] ?? accentColors.orange;
  const value = useMemo(
    () => ({
      c: { ...c, accent: c.dark ? palette.dark : palette.light, primary: palette.fill,
        ...(highContrast ? { muted: c.text, line: c.muted } : {}) },
      reduceMotion,
      reduceTransparency,
      contrast: highContrast,
    }),
    [c, palette, highContrast, reduceMotion, reduceTransparency],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
export const type = {
  display: 52,
  title: 34,
  heading: 23,
  subheading: 18,
  body: 17,
  caption: 13,
  micro: 11,
};

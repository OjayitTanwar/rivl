export const accentColors = {
  orange: { label: "Orange", light: "#BC2D1D", dark: "#FF705B", fill: "#FF4B35" },
  blue: { label: "Blue", light: "#165AA8", dark: "#8CB9FF", fill: "#8CB9FF" },
  purple: { label: "Purple", light: "#7040AD", dark: "#C3A5FF", fill: "#C3A5FF" },
  green: { label: "Green", light: "#216C3E", dark: "#8DD5A3", fill: "#8DD5A3" },
  teal: { label: "Teal", light: "#087063", dark: "#64D5BC", fill: "#64D5BC" },
  pink: { label: "Pink", light: "#A52D65", dark: "#FF98BE", fill: "#FF98BE" },
} as const;
export type AccentColor = keyof typeof accentColors;

import type { ThemeSelection } from "./settingsOptions";

/** Gradient swatch preview shown next to each theme choice in Settings > Theme. */
export const THEME_SWATCHES: Record<ThemeSelection, string> = {
  system: "linear-gradient(135deg, #f8fafc 0%, #f8fafc 50%, #0b0f19 50%, #0b0f19 100%)",
  light: "linear-gradient(135deg, #ffffff, #e2e8f0)",
  dark: "linear-gradient(135deg, #0b0f19, #1f2937)",
  neon: "linear-gradient(135deg, #b6ff2b, #0a1508)",
  purple: "linear-gradient(135deg, #c77dff, #12091f)",
  blue: "linear-gradient(135deg, #74d4ff, #0a1324)",
};

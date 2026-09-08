import { alpha, createTheme, darken, lighten, type Theme, type ThemeOptions } from "@mui/material/styles";
import type { ResolvedTheme } from "./constants/settingsOptions";

export type { ResolvedTheme };

export const THEME_IDS: ResolvedTheme[] = ["light", "dark"];

const BODY_FONT_STACK =
  '"Open Sans", "system-ui", "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
/** The brand/display face used for h5/h6 (page and section titles) and the Wordmark -- kept as
 *  one exported constant so both stay in sync. */
export const DISPLAY_FONT_STACK = '"PrintStash Display", sans-serif';

/**
 * Extra design tokens MUI's Theme doesn't model natively: the page background (a plain color
 * for light/dark, a layered radial-gradient CSS value for the neon/purple/blue themes) and the
 * three.js model material colors used by ModelViewer's paletteForTheme().
 */
declare module "@mui/material/styles" {
  interface Theme {
    printstash: {
      pageBackground: string;
      modelColor: string;
      modelEmissive: string;
      /** A separate accent used for things that shouldn't compete with the primary green
       *  (e.g. an attention/alert-style label) -- not one of MUI's error/warning palette
       *  roles, just a second brand-adjacent color for cases that call for it. */
      altText: string;
    };
  }
  interface ThemeOptions {
    printstash: {
      pageBackground: string;
      modelColor: string;
      modelEmissive: string;
      altText: string;
    };
  }
}

type ThemeDef = {
  mode: "light" | "dark";
  pageBackground: string;
  panel: string;
  panelStrong: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentLight: string;
  accentStrong: string;
  accentSoft: string;
  accentContrast: string;
  altText: string;
  modelColor: string;
  modelEmissive: string;
};

// Values ported 1:1 from the original CSS custom properties so the visual identity of each
// theme carries over even though the implementation is now an MUI theme object.
const THEME_DEFS: Record<ResolvedTheme, ThemeDef> = {
  light: {
    mode: "light",
    pageBackground: "#f7f7f7",
    panel: "#ffffff",
    panelStrong: "#ffffff",
    border: "#ebebeb",
    borderStrong: "#ebebeb",
    text: "#1f1f1f",
    textMuted: "#858585",
    textSubtle: "#858585",
    accent: "#00b800",
    accentLight: "#5be584",
    accentStrong: darken("#00b800", 0.15),
    accentSoft: alpha("#00b800", 0.16),
    accentContrast: "#ffffff",
    altText: "rgb(255, 114, 32)",
    modelColor: "#cbd5e1",
    modelEmissive: "#94a3b8",
  },
  dark: {
    mode: "dark",
    pageBackground: "#0a0b0c",
    panel: "rgba(15, 23, 42, 0.86)",
    panelStrong: "#0f172a",
    border: "#1f2937",
    borderStrong: "#334155",
    text: "#f8fafc",
    textMuted: "#94a3b8",
    textSubtle: "#64748b",
    accent: "#34d399",
    accentLight: lighten("#34d399", 0.25),
    accentStrong: "#10b981",
    accentSoft: "rgba(16, 185, 129, 0.2)",
    accentContrast: "#ffffff",
    altText: "rgb(255, 114, 32)",
    modelColor: "#e2e8f0",
    modelEmissive: "#475569",
  },
};

export function buildTheme(id: ResolvedTheme): Theme {
  const d = THEME_DEFS[id];
  const options: ThemeOptions = {
    palette: {
      mode: d.mode,
      background: { default: d.mode === "light" ? d.pageBackground : d.panelStrong, paper: d.panel },
      primary: { main: d.accent, light: d.accentLight, dark: d.accentStrong, contrastText: d.accentContrast },
      text: { primary: d.text, secondary: d.textMuted },
      divider: d.border,
      action: {
        selected: alpha(d.accentLight, 0.2),
        hover: alpha(d.accent, 0.08),
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontSize: 13,
      fontFamily: BODY_FONT_STACK,
      button: { textTransform: "none", fontWeight: 600 },
      h5: { fontFamily: DISPLAY_FONT_STACK, fontWeight: 500 },
      h6: { fontFamily: DISPLAY_FONT_STACK, fontWeight: 500 },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none", backgroundColor: d.panel } } },
      MuiAppBar: { styleOverrides: { root: { backgroundColor: d.panelStrong, color: d.text } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundColor: d.panelStrong, borderColor: d.border } } },
      MuiButton: { styleOverrides: { root: { borderRadius: 8 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: d.panelStrong, color: d.text } } },
    },
    printstash: {
      pageBackground: d.pageBackground,
      modelColor: d.modelColor,
      modelEmissive: d.modelEmissive,
      altText: d.altText,
    },
  };
  return createTheme(options);
}

/** textSubtle isn't part of MUI's palette shape; components that need it read this directly. */
export function subtleTextColor(id: ResolvedTheme): string {
  return THEME_DEFS[id].textSubtle;
}

/** accentSoft (a translucent tint of the accent color) isn't part of MUI's palette shape either. */
export function accentSoftColor(id: ResolvedTheme): string {
  return THEME_DEFS[id].accentSoft;
}

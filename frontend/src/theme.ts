import { createTheme, type Theme, type ThemeOptions } from "@mui/material/styles";
import type { ResolvedTheme } from "./constants/settingsOptions";

export type { ResolvedTheme };

export const THEME_IDS: ResolvedTheme[] = ["light", "dark", "neon", "purple", "blue"];

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
    };
  }
  interface ThemeOptions {
    printstash: {
      pageBackground: string;
      modelColor: string;
      modelEmissive: string;
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
  accentStrong: string;
  accentSoft: string;
  accentContrast: string;
  modelColor: string;
  modelEmissive: string;
};

// Values ported 1:1 from the original CSS custom properties so the visual identity of each
// theme carries over even though the implementation is now an MUI theme object.
const THEME_DEFS: Record<ResolvedTheme, ThemeDef> = {
  light: {
    mode: "light",
    pageBackground: "#f8fafc",
    panel: "rgba(255, 255, 255, 0.92)",
    panelStrong: "#ffffff",
    border: "#e5e7eb",
    borderStrong: "#d1d5db",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#94a3b8",
    accent: "#10b981",
    accentStrong: "#059669",
    accentSoft: "rgba(16, 185, 129, 0.16)",
    accentContrast: "#ffffff",
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
    accentStrong: "#10b981",
    accentSoft: "rgba(16, 185, 129, 0.2)",
    accentContrast: "#ffffff",
    modelColor: "#e2e8f0",
    modelEmissive: "#475569",
  },
  neon: {
    mode: "dark",
    pageBackground:
      "radial-gradient(1200px circle at 15% 10%, rgba(182, 255, 43, 0.2), transparent 60%)," +
      "radial-gradient(900px circle at 85% 0%, rgba(120, 255, 66, 0.14), transparent 55%), #050b05",
    panel: "rgba(8, 18, 9, 0.9)",
    panelStrong: "#0a1508",
    border: "#1d2f1a",
    borderStrong: "#2f4a25",
    text: "#e5ffd2",
    textMuted: "#9ad48a",
    textSubtle: "#6fa662",
    accent: "#b6ff2b",
    accentStrong: "#d7ff6f",
    accentSoft: "rgba(182, 255, 43, 0.18)",
    accentContrast: "#071308",
    modelColor: "#b6ff2b",
    modelEmissive: "#3a7a1a",
  },
  purple: {
    mode: "dark",
    pageBackground:
      "radial-gradient(1200px circle at 18% 10%, rgba(199, 125, 255, 0.22), transparent 60%)," +
      "radial-gradient(900px circle at 82% 0%, rgba(146, 88, 255, 0.16), transparent 55%), #080510",
    panel: "rgba(16, 10, 27, 0.9)",
    panelStrong: "#12091f",
    border: "#2b1e44",
    borderStrong: "#3b2961",
    text: "#f3e8ff",
    textMuted: "#c4b5fd",
    textSubtle: "#8b79b8",
    accent: "#c77dff",
    accentStrong: "#e4c8ff",
    accentSoft: "rgba(199, 125, 255, 0.18)",
    accentContrast: "#12071a",
    modelColor: "#c77dff",
    modelEmissive: "#6a2da8",
  },
  blue: {
    mode: "dark",
    pageBackground:
      "radial-gradient(1200px circle at 20% 8%, rgba(116, 212, 255, 0.2), transparent 60%)," +
      "radial-gradient(900px circle at 80% 0%, rgba(66, 145, 255, 0.16), transparent 55%), #050b12",
    panel: "rgba(8, 16, 28, 0.9)",
    panelStrong: "#0a1324",
    border: "#1b2a42",
    borderStrong: "#274166",
    text: "#e0f2ff",
    textMuted: "#93c5fd",
    textSubtle: "#6b8dbb",
    accent: "#74d4ff",
    accentStrong: "#b6ecff",
    accentSoft: "rgba(116, 212, 255, 0.18)",
    accentContrast: "#061019",
    modelColor: "#74d4ff",
    modelEmissive: "#1f5c9a",
  },
};

export function buildTheme(id: ResolvedTheme): Theme {
  const d = THEME_DEFS[id];
  const options: ThemeOptions = {
    palette: {
      mode: d.mode,
      background: { default: d.mode === "light" ? d.pageBackground : d.panelStrong, paper: d.panel },
      primary: { main: d.accent, dark: d.accentStrong, contrastText: d.accentContrast },
      text: { primary: d.text, secondary: d.textMuted },
      divider: d.border,
    },
    shape: { borderRadius: 10 },
    typography: {
      fontSize: 13,
      button: { textTransform: "none", fontWeight: 600 },
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

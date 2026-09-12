import { alpha, createTheme, darken, type Theme, type ThemeOptions } from "@mui/material/styles";
import type { ResolvedTheme } from "./constants/settingsOptions";

export type { ResolvedTheme };

export const THEME_IDS: ResolvedTheme[] = ["light", "dark"];

const BODY_FONT_STACK =
  '"Open Sans", "system-ui", "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
/** The brand/display face used for h5/h6 (page and section titles) -- kept as one exported
 *  constant so every usage stays in sync. */
export const DISPLAY_FONT_STACK = '"Thingport", sans-serif';

/**
 * Extra design tokens MUI's Theme doesn't model natively: the page background (a plain color
 * for light/dark, a layered radial-gradient CSS value for the neon/purple/blue themes) and the
 * three.js model material colors used by ModelViewer's paletteForTheme().
 */
declare module "@mui/material/styles" {
  interface Theme {
    thingport: {
      pageBackground: string;
      modelColor: string;
      modelEmissive: string;
      /** A separate accent used for things that shouldn't compete with the primary green
       *  (e.g. an attention/alert-style label) -- not one of MUI's error/warning palette
       *  roles, just a second brand-adjacent color for cases that call for it. */
      altText: string;
      /** Unselected nav-row label/icon color for the Sidebar rail and the Models page's
       *  Categories box -- narrower than text.secondary (which is used all over for ordinary
       *  muted text) so recoloring nav rows can't leak into unrelated UI. */
      navInactiveText: string;
      /** Selected nav row background (Sidebar rail rows, Categories box rows) -- a `background`
       *  (not `bgcolor`) value since dark mode's is a left-to-right gradient, not a flat color;
       *  light mode's is still just a flat tint expressed the same way. */
      selectedNavBackground: string;
      /** Selected nav row label/icon color -- the brand accent in dark mode, unchanged
       *  (inherited) text color in light mode. */
      selectedNavText: string;
      /** Heading/emphasis text (dashboard stat numbers and pane headers, a model card's title,
       *  the model detail page's "Description"/"Tags" headlines, etc.) -- plain white in dark
       *  mode for contrast against those panes' backgrounds, unchanged (text.primary) in light. */
      headingText: string;
    };
  }
  interface ThemeOptions {
    thingport: {
      pageBackground: string;
      modelColor: string;
      modelEmissive: string;
      altText: string;
      navInactiveText: string;
      selectedNavBackground: string;
      selectedNavText: string;
      headingText: string;
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
  navInactiveText: string;
  selectedNavBackground: string;
  selectedNavText: string;
  headingText: string;
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
    navInactiveText: "#858585",
    selectedNavBackground: alpha("#5be584", 0.2),
    // Matches the pre-existing collapsed-rail icon treatment (selected -> primary.main).
    selectedNavText: "#00b800",
    headingText: "#1f1f1f", // == text above; unused in light mode's actual styling either way
  },
  dark: {
    mode: "dark",
    pageBackground: "#181f39",
    panel: "#1e2746",
    panelStrong: "#1e2746",
    border: "#333a54",
    borderStrong: "#333a54",
    text: "#828690",
    textMuted: "#828690",
    textSubtle: "#828690",
    accent: "#00b800",
    accentLight: "#5be584",
    accentStrong: darken("#00b800", 0.15),
    accentSoft: alpha("#00b800", 0.16),
    accentContrast: "#ffffff",
    altText: "rgb(255, 114, 32)",
    modelColor: "#e2e8f0",
    modelEmissive: "#475569",
    navInactiveText: "#969ba0",
    selectedNavBackground: "linear-gradient(to right, rgb(24, 31, 57) 0%, rgba(49, 206, 255, 0) 100%)",
    selectedNavText: "#00b800",
    headingText: "#ffffff",
  },
};

export function buildTheme(id: ResolvedTheme): Theme {
  const d = THEME_DEFS[id];
  const options: ThemeOptions = {
    palette: {
      mode: d.mode,
      background: { default: d.pageBackground, paper: d.panel },
      primary: { main: d.accent, light: d.accentLight, dark: d.accentStrong, contrastText: d.accentContrast },
      text: { primary: d.text, secondary: d.textMuted },
      divider: d.border,
      action: {
        selected: alpha(d.accentLight, 0.2),
        hover: alpha(d.accent, 0.08),
      },
    },
    shape: { borderRadius: d.mode === "dark" ? 0 : 10 },
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
      // Dark mode is deliberately square everywhere -- corners, chips, avatars, the back-to-top
      // FAB, all of it. `sx`-set radii (the vast majority of them: cards, panels, the info box,
      // etc.) beat theme.shape.borderRadius and component styleOverrides alike, so nothing short
      // of an !important global rule reaches all of them; MuiCssBaseline's styleOverrides is
      // exactly the escape hatch for page-level CSS the theme needs to own like this.
      ...(d.mode === "dark"
        ? {
            MuiCssBaseline: { styleOverrides: "*, *::before, *::after { border-radius: 0 !important; }" },
            // A success toast (see ToastProvider) should read as "this worked" in the brand
            // green, not MUI's own default success palette -- e.g. favoriting a model.
            MuiAlert: { styleOverrides: { filledSuccess: { backgroundColor: d.accent, color: d.accentContrast } } },
          }
        : {}),
    },
    thingport: {
      pageBackground: d.pageBackground,
      modelColor: d.modelColor,
      modelEmissive: d.modelEmissive,
      altText: d.altText,
      navInactiveText: d.navInactiveText,
      selectedNavBackground: d.selectedNavBackground,
      selectedNavText: d.selectedNavText,
      headingText: d.headingText,
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

export type SlicerOption = { id: string; label: string };

// Limited to slicers that register their own URL protocol for opening a remote model directly
// (e.g. bambustudio://) -- the only ones a future "open in {slicer}" launch could actually use.
// IDs must match backend's services/slicerPreferenceService.ts SLICER_IDS, and (id !== "other")
// must equal the exact scheme the slicer registers -- e.g. Creality Print's is "crealityprintlink"
// (crealityprintlink://open?file=...), not "creality", per its libslic3r/Utils.hpp.
export const SLICER_OPTIONS: SlicerOption[] = [
  { id: "bambustudio", label: "Bambu Studio" },
  { id: "orcaslicer", label: "OrcaSlicer" },
  { id: "prusaslicer", label: "PrusaSlicer" },
  { id: "crealityprintlink", label: "Creality Print" },
  { id: "other", label: "Other / Manual" },
];

/** The user's persisted theme choice. There's no "system" option -- the user picks explicitly. */
export type ThemeSelection = "light" | "dark";
/** Alias kept for call sites written against the pre-reduction light/dark/neon/purple/blue
 *  palette -- now identical to ThemeSelection since every selection is already resolved. */
export type ResolvedTheme = ThemeSelection;
export type ThemeOption = { id: ThemeSelection; label: string; description: string };

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "light", label: "Light", description: "Bright backgrounds, dark text." },
  { id: "dark", label: "Dark", description: "Dimmed panels for low light." },
];

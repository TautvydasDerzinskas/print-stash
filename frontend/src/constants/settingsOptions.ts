export type SlicerOption = { id: string; label: string };

export const SLICER_OPTIONS: SlicerOption[] = [
  { id: "orca", label: "OrcaSlicer" },
  { id: "bambu", label: "Bambu Studio" },
  { id: "prusa", label: "PrusaSlicer" },
  { id: "superslicer", label: "SuperSlicer" },
  { id: "cura", label: "UltiMaker Cura" },
  { id: "ideamaker", label: "ideaMaker" },
  { id: "simplify3d", label: "Simplify3D" },
  { id: "kisslicer", label: "KISSlicer" },
  { id: "repetier", label: "Repetier-Host" },
  { id: "chitubox", label: "ChiTuBox" },
  { id: "lychee", label: "Lychee Slicer" },
  { id: "photon", label: "Anycubic Photon Workshop" },
  { id: "creality", label: "Creality Print" },
  { id: "other", label: "Other / Manual" },
];

export type EngraverOption = { id: string; label: string };

export const ENGRAVER_OPTIONS: EngraverOption[] = [
  { id: "lightburn", label: "LightBurn" },
  { id: "ezcad", label: "EZCAD" },
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

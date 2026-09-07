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

/** The user's persisted theme choice — "system" defers to the OS preference. */
export type ThemeSelection = "system" | "light" | "dark" | "neon" | "purple" | "blue";
/** A theme choice after "system" has been resolved to light/dark — what buildTheme() consumes. */
export type ResolvedTheme = "light" | "dark" | "neon" | "purple" | "blue";
export type ThemeOption = { id: ThemeSelection; label: string; description: string };

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "system", label: "System", description: "Match your device preference." },
  { id: "light", label: "Light", description: "Bright backgrounds, dark text." },
  { id: "dark", label: "Dark", description: "Dimmed panels for low light." },
  { id: "neon", label: "Neon Green", description: "Black UI with neon green accents." },
  { id: "purple", label: "Neon Purple", description: "Black UI with purple glow highlights." },
  { id: "blue", label: "Neon Blue", description: "Black UI with blue glow highlights." },
];

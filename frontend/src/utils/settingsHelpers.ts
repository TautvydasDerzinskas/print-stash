import { ENGRAVER_OPTIONS, SLICER_OPTIONS, type ResolvedTheme, type ThemeSelection } from "../constants/settingsOptions";

export function slicerLabelFor(id?: string | null) {
  if (!id) return "Slicer";
  const match = SLICER_OPTIONS.find(opt => opt.id === id);
  return match ? match.label : "Slicer";
}

export function engraverLabelFor(id?: string | null) {
  if (!id) return "Engraving";
  const match = ENGRAVER_OPTIONS.find(opt => opt.id === id);
  return match ? match.label : "Engraving";
}

export function resolveTheme(selected: ThemeSelection): ResolvedTheme {
  if (selected === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }
  return selected;
}

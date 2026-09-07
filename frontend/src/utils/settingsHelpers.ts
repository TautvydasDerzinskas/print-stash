import { ENGRAVER_OPTIONS, SLICER_OPTIONS } from "../constants/settingsOptions";

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

/** Extensions (lowercase, no leading dot) the interactive 3D viewer can render. */
export const MODEL_EXTS = new Set(["stl", "3mf", "step", "stp", "obj"]);

/** LightBurn project file extensions. */
export const LIGHTBURN_EXTS = new Set(["lbrn", "lbrn2"]);

/** Extensions eligible for the "Open in Engraving Software" action. */
export const ENGRAVING_EXTS = new Set([
  "svg",
  "dxf",
  "ai",
  "eps",
  "pdf",
  "plt",
  "hpgl",
  "png",
  "jpg",
  "jpeg",
  "bmp",
  "gif",
  "tif",
  "tiff",
  "lbrn",
  "lbrn2",
  "ezd",
]);

/** Extensions offered by Settings' local-folder-scan import feature. */
export const SCAN_EXTS = ["stl", "3mf", "step", "stp", "obj", "lbrn", "lbrn2"];
export const SCAN_EXT_SET = new Set(SCAN_EXTS);

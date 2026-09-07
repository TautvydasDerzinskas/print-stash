import type { TFunction } from "i18next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { type Print, type Plate, printsApi } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { MODEL_EXTS, LIGHTBURN_EXTS } from "../../constants/fileTypes";
import { extOf } from "../../utils/fileExtensions";
import ModelViewer from "./ModelViewer";
import { ModelSnapshot } from "./ModelViewer/ModelSnapshot";
import LightBurnPreview from "./LightBurnPreview";

export type PreviewVariant = "card" | "modal";

function PreviewPlaceholder({ text }: { text: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
      <Typography variant="body2" color="text.disabled">{text}</Typography>
    </Box>
  );
}

// Shared by PrintCard (card thumbnail, variant "card") and PrintPreviewModal (full detail view,
// variant "modal") -- picks the right preview widget (raster image, ModelViewer/ModelSnapshot for
// 3D, LightBurnPreview, or a placeholder) for a print's active plate.
export function renderPreviewContent(
  print: Print,
  variant: PreviewVariant,
  theme: ResolvedTheme,
  t: TFunction,
  previewMode: PreviewMode = "automatic",
  activePlate?: Plate
) {
  const plate = variant === "modal" ? (activePlate || print.plates[0]) : print.plates[0];
  const imgSx = variant === "card"
    ? { width: "100%", height: "100%", objectFit: "cover" as const }
    : { width: "100%", height: "100%", objectFit: "contain" as const, bgcolor: "action.hover" };

  if (!plate) {
    return <PreviewPlaceholder text={t("library:modelViewer.noPreview")} />;
  }

  const ext = extOf(plate.filename);
  const plateUrl = printsApi.fileUrl(plate.url);
  const thumbUrl = variant === "card"
    ? (print.thumb_url ? printsApi.fileUrl(print.thumb_url) : null)
    : (plate.thumb_url ? printsApi.fileUrl(plate.thumb_url) : null);
  const is3d = MODEL_EXTS.has(ext);
  const isLightBurn = LIGHTBURN_EXTS.has(ext);

  if (variant === "card") {
    if (thumbUrl) {
      return <Box component="img" src={thumbUrl} alt={plate.filename} sx={imgSx} />;
    }
    if (ext === "svg") {
      return <Box component="img" src={plateUrl} alt={plate.filename} sx={imgSx} />;
    }
    if (is3d) {
      if (previewMode === "disabled") {
        return <PreviewPlaceholder text={t("library:modelViewer.previewDisabled")} />;
      }
      return <ModelSnapshot url={plateUrl} ext={ext} plateId={plate.id} theme={theme} mode={previewMode} />;
    }
    if (isLightBurn) {
      return (
        <LightBurnPreview
          url={plateUrl}
          assetId={plate.id}
          filename={plate.filename}
          imgSx={imgSx}
        />
      );
    }
    return <PreviewPlaceholder text={t("library:modelViewer.noPreview")} />;
  }

  if (is3d) {
    return (
      <ModelViewer
        key={`${variant}-${print.id}-${plate.id}`}
        url={plateUrl}
        ext={ext}
        viewKey={`${print.id}-${plate.id}`}
        theme={theme}
      />
    );
  }
  if (thumbUrl || ext === "svg") {
    const src = thumbUrl || plateUrl;
    return <Box component="img" src={src} alt={plate.filename} sx={imgSx} />;
  }
  if (isLightBurn) {
    return (
      <LightBurnPreview
        url={plateUrl}
        assetId={plate.id}
        filename={plate.filename}
        imgSx={imgSx}
      />
    );
  }
  return <PreviewPlaceholder text={t("library:modelViewer.previewUnavailable")} />;
}

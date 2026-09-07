import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { type Print, printsApi } from "../../api/prints";
import { MODEL_EXTS } from "../../constants/fileTypes";
import { extOf } from "../../utils/fileExtensions";
import ModelViewer from "../../components/media/ModelViewer";

// A neutral, theme-independent canvas -- this is a fixed "product shot" style preview, not part
// of the app's light/dark chrome, so it stays the same regardless of the viewer's theme.
const PREVIEW_BG = "#e7e7ea";
// Matches the reference preview's solid red plate color; unrelated to theme.printstash.modelColor.
const PREVIEW_MODEL_COLOR = "#d32f2f";

type Props = {
  print: Print;
  onClose: () => void;
};

/** The "3D Preview" modal opened from the model detail page's main image: a fixed neutral canvas
 *  rendering the active plate in a fixed red so it reads as a print preview rather than a themed
 *  UI element, with a plate-switcher overlay always shown on the left (even for a single plate,
 *  so the panel doesn't jump in/out of existence as plates are added/removed). */
export default function Model3DPreviewModal({ print, onClose }: Props) {
  const { t } = useTranslation(["models", "library", "common"]);
  const sortedPlates = useMemo(() => print.plates.toSorted((a, b) => a.position - b.position), [print.plates]);
  const [activePlateId, setActivePlateId] = useState<string | null>(sortedPlates[0]?.id ?? null);
  const activePlate = sortedPlates.find(p => p.id === activePlateId) || sortedPlates[0];
  const ext = activePlate ? extOf(activePlate.filename) : "";
  const is3d = Boolean(activePlate) && MODEL_EXTS.has(ext);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="lg"
      onClose={onClose}
      slotProps={{ paper: { sx: { height: "85vh", bgcolor: PREVIEW_BG, backgroundImage: "none" } } }}
    >
      <IconButton
        onClick={onClose}
        aria-label={t("common:close") ?? undefined}
        sx={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 2,
          bgcolor: "rgba(0, 0, 0, 0.45)",
          color: "#fff",
          "&:hover": { bgcolor: "rgba(0, 0, 0, 0.65)" },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      <Box sx={{ position: "relative", flex: 1, height: "100%" }}>
        <Paper
          elevation={3}
          sx={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 2,
            width: 240,
            maxHeight: "calc(100% - 32px)",
            overflow: "auto",
            p: 1,
            borderRadius: "12px",
          }}
        >
          <List disablePadding>
            {sortedPlates.map((plate, idx) => (
              <ListItemButton
                key={plate.id}
                selected={plate.id === activePlate?.id}
                onClick={() => setActivePlateId(plate.id)}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {plate.thumb_url ? (
                    <Box
                      component="img"
                      src={printsApi.fileUrl(plate.thumb_url)}
                      alt={plate.filename}
                      sx={{ width: 32, height: 32, borderRadius: 0.75, objectFit: "cover" }}
                    />
                  ) : (
                    <Box sx={{ width: 32, height: 32, borderRadius: 0.75, bgcolor: "action.hover" }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={t("models:detail.plateLabel", { n: idx + 1 })}
                  secondary={plate.filename}
                  primaryTypographyProps={{ variant: "body2" }}
                  secondaryTypographyProps={{ variant: "caption", noWrap: true }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>

        <Box sx={{ width: "100%", height: "100%" }}>
          {is3d && activePlate ? (
            <ModelViewer
              key={activePlate.id}
              url={printsApi.fileUrl(activePlate.url)}
              ext={ext}
              viewKey={`preview-${print.id}-${activePlate.id}`}
              theme="light"
              colorOverride={PREVIEW_MODEL_COLOR}
            />
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <Typography color="text.secondary">{t("library:modelViewer.previewUnavailable")}</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}

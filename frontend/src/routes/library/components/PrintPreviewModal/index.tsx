import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import {
  type Print,
  type Plate,
  UnauthorizedError,
  LastPlateError,
  fileUrl,
  addPlates,
  deletePlate,
} from "../../../../services/api";
import { type ResolvedTheme } from "../../../../constants/settingsOptions";
import { MODEL_EXTS, ENGRAVING_EXTS } from "../../../../constants/fileTypes";
import { SLICER_BRIDGE_ENABLED } from "../../../../constants/featureFlags";
import { extOf } from "../../../../utils/fileExtensions";
import { formatFileSize } from "../../../../utils/fileSize";
import TagBadge from "../../../../common/TagBadge";
import PreparedPrintSummary from "../PreparedPrintSummary";
import { renderPreviewContent } from "../renderPreviewContent";
import PlateSwitcher from "./components/PlateSwitcher";

export default function PrintPreviewModal({
  print,
  theme,
  slicerEnabled,
  slicerLabel,
  slicerSelected,
  engravingEnabled,
  engraverLabel,
  engravingSelected,
  onClose,
  onPrintChanged,
  onUnauthorized,
}: {
  print: Print;
  theme: ResolvedTheme;
  slicerEnabled: boolean;
  slicerLabel: string;
  slicerSelected?: string;
  engravingEnabled: boolean;
  engraverLabel: string;
  engravingSelected?: string;
  onClose: () => void;
  onPrintChanged: (print: Print) => void;
  onUnauthorized?: () => void;
}) {
  const { t } = useTranslation(["library", "common"]);
  const [activePlateId, setActivePlateId] = useState<string | null>(print.plates[0]?.id || null);
  const [addingPlate, setAddingPlate] = useState(false);
  const [removingPlateId, setRemovingPlateId] = useState<string | null>(null);

  useEffect(() => {
    setActivePlateId(print.plates[0]?.id || null);
    // Only reset the active plate when a *different* print is opened -- an
    // in-place plate list change (add/remove) should not jump back to
    // plate[0] unless the active plate itself disappeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print.id]);

  const sortedPlates = useMemo(
    () => print.plates.toSorted((a, b) => a.position - b.position),
    [print.plates]
  );
  const activePlate = sortedPlates.find(p => p.id === activePlateId) || sortedPlates[0];

  const handleAddPlateFiles = async (files: File[]) => {
    if (!files.length) return;
    setAddingPlate(true);
    try {
      const { print: updated } = await addPlates(print.id, files);
      onPrintChanged(updated);
      const newest = updated.plates.toSorted((a, b) => a.position - b.position).slice(-1)[0];
      if (newest) setActivePlateId(newest.id);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      alert(err instanceof Error ? err.message : t("library:errors.addPlateFailed"));
    } finally {
      setAddingPlate(false);
    }
  };

  const handleRemovePlate = async (plate: Plate) => {
    if (print.plates.length <= 1) return;
    if (!window.confirm(t("library:confirm.removePlate", { filename: plate.filename }))) return;
    setRemovingPlateId(plate.id);
    try {
      const { print: updated } = await deletePlate(print.id, plate.id);
      onPrintChanged(updated);
      setActivePlateId(current => {
        if (current !== plate.id) return current;
        const ordered = updated.plates.toSorted((a, b) => a.position - b.position);
        return ordered[0]?.id || null;
      });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      if (err instanceof LastPlateError) {
        alert(err.message);
        return;
      }
      console.error(err);
      alert(err instanceof Error ? err.message : t("library:errors.removePlateFailed"));
    } finally {
      setRemovingPlateId(null);
    }
  };

  const primaryExt = activePlate ? extOf(activePlate.filename) : "";
  const isFirstPlate = activePlate ? activePlate.position === 0 : false;
  const canOpenActiveInSlicer = Boolean(activePlate) && slicerEnabled &&
    ((isFirstPlate && Boolean(print.prepared_print)) || MODEL_EXTS.has(primaryExt));
  const canOpenActiveInEngraving = Boolean(activePlate) && engravingEnabled && ENGRAVING_EXTS.has(primaryExt);

  const openActiveInSlicer = () => {
    if (!SLICER_BRIDGE_ENABLED || !activePlate) return;
    const url = fileUrl(isFirstPlate ? (print.slicer_url || activePlate.url) : activePlate.url);
    const filename = isFirstPlate ? (print.slicer_filename || activePlate.filename) : activePlate.filename;
    const params = new URLSearchParams({ url, slicer: slicerSelected || "orca", filename: filename || "model" });
    window.location.href = `printstash-slicer://open?${params.toString()}`;
  };

  const openActiveInEngraving = () => {
    if (!activePlate) return;
    const url = fileUrl(activePlate.url);
    const params = new URLSearchParams({ url, engraver: engravingSelected || "lightburn", filename: activePlate.filename || "design" });
    window.location.href = `printstash-engrave://open?${params.toString()}`;
  };

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" noWrap>{print.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {activePlate ? `${activePlate.filename} · ${formatFileSize(activePlate.size)}` : ""}
            {print.plates.length > 1 ? ` · ${t("library:previewModal.plateCount", { count: print.plates.length })}` : ""}
          </Typography>
          {(print.creator || print.collection) && (
            <Typography variant="caption" color="text.secondary" component="p">
              {[
                print.creator ? t("library:card.byCreator", { creator: print.creator }) : "",
                print.collection ? t("library:card.collectionLabel", { collection: print.collection }) : "",
              ].filter(Boolean).join(" · ")}
            </Typography>
          )}
          {print.prepared_print && (
            <Box sx={{ mt: 1 }}><PreparedPrintSummary prepared={print.prepared_print} /></Box>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label={t("common:close")} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <PlateSwitcher
            plates={sortedPlates}
            activePlateId={activePlateId}
            onSelectPlate={setActivePlateId}
            onRemovePlate={handleRemovePlate}
            removingPlateId={removingPlateId}
            canRemove={print.plates.length > 1}
            addingPlate={addingPlate}
            onAddPlateFiles={handleAddPlateFiles}
          />
          <Box sx={{ width: "100%", height: "65vh", minHeight: 360 }}>
            <Box sx={{ width: "100%", height: "100%", borderRadius: 2, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {renderPreviewContent(print, "modal", theme, t, "automatic", activePlate)}
            </Box>
          </Box>
          {(canOpenActiveInSlicer || canOpenActiveInEngraving) && (
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
              {canOpenActiveInSlicer && (
                <Button size="small" variant="outlined" onClick={openActiveInSlicer}>
                  {t("library:previewModal.openPlateInSlicer", { slicer: slicerLabel })}
                </Button>
              )}
              {canOpenActiveInEngraving && (
                <Button size="small" variant="outlined" onClick={openActiveInEngraving}>
                  {t("library:previewModal.openPlateInEngraving", { engraver: engraverLabel })}
                </Button>
              )}
            </Stack>
          )}
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
            {print.tags.length ? (
              print.tags.map(tag => <TagBadge key={tag} tag={tag} />)
            ) : (
              <Typography variant="caption" color="text.disabled">{t("library:previewModal.noTags")}</Typography>
            )}
          </Stack>
          {print.notes && (
            <Paper variant="outlined" sx={{ borderStyle: "dashed", p: 1.5 }}>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{print.notes}</Typography>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {activePlate && (
          <Button
            variant="contained"
            startIcon={<DownloadIcon fontSize="small" />}
            component="a"
            href={fileUrl(activePlate.url)}
            download={activePlate.filename}
          >
            {t("library:previewModal.downloadPlate")}
          </Button>
        )}
        <Button variant="outlined" onClick={onClose}>{t("library:previewModal.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

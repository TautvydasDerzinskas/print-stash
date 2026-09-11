import { useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LaunchIcon from "@mui/icons-material/Launch";
import type { SxProps, Theme } from "@mui/material/styles";
import { UnauthorizedError } from "../../api/client";
import { type Print, printsApi } from "../../api/prints";
import { slicerLaunchUrl } from "../../utils/slicerLaunch";
import { useConfirm } from "../../components/ConfirmProvider";
import { importProviderInfo } from "../../constants/importProviders";
import { SLICER_OPTIONS } from "../../constants/settingsOptions";
import { useSlicerPreference } from "../../hooks/useSlicerPreference";
import { useDownloadPrint } from "./useDownloadPrint";
import DownloadPickerDialog from "./DownloadPickerDialog";

type Props = {
  print: Print;
  onUnauthorized?: () => void;
  onDeleted: () => void;
  /** Lets callers restyle the trigger button -- e.g. the Models grid's hover overlay, which
   *  needs to read over an arbitrary thumbnail instead of the detail page header's plain icon. */
  triggerSx?: SxProps<Theme>;
  /** Overrides the trigger icon's glyph size in px -- default (undefined) keeps the standard
   *  fontSize="small" (20px) used everywhere else. Only the Models grid hover overlay bumps
   *  this, to stay legible now that it no longer sits on a dark circular backdrop. */
  iconFontSize?: number;
};

/** The "..." menu for a model: "Open in {Slicer}" (launches the user's preferred slicer via its
 *  own URL protocol -- disabled when no slicer is set, or it's set to "Other"), Download (single
 *  file, or a plate picker / zip-all for multi-plate models), Edit (disabled for now), Delete
 *  (confirm, then delete), and -- only for an imported print -- a divider then "Open in
 *  {Provider}" linking back to the original model page. Shared by the model detail page's header
 *  and the Models/Collection grids' per-card hover overlay. */
export default function ModelActionsMenu({ print, onUnauthorized, onDeleted, triggerSx, iconFontSize }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const confirmDialog = useConfirm();
  const slicerPreference = useSlicerPreference();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { pickerOpen, setPickerOpen, downloading, handleDownload, downloadPlate, downloadAllZip, sortedPlates } =
    useDownloadPrint(print, onUnauthorized);

  const closeMenu = () => setAnchorEl(null);

  const onDownloadClick = () => {
    closeMenu();
    handleDownload();
  };

  const handleDelete = async () => {
    closeMenu();
    const confirmed = await confirmDialog({
      message: t("models:detail.confirmDelete", { name: print.title || print.name }),
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await printsApi.delete(print.id);
      onDeleted();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      alert(t("models:detail.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const providerInfo = importProviderInfo(print.source_provider);
  // "other" has no registered URL protocol to launch -- treated the same as no preference set.
  const slicerOption = SLICER_OPTIONS.find(opt => opt.id === slicerPreference && opt.id !== "other");
  const openInSlicerHref = slicerOption && print.slicer_url
    ? slicerLaunchUrl(slicerOption.id, printsApi.fileUrl(print.slicer_url), print.slicer_filename ?? undefined)
    : undefined;

  return (
    <>
      <IconButton
        size="small"
        onClick={e => setAnchorEl(e.currentTarget)}
        aria-label={t("common:more") ?? undefined}
        disabled={deleting}
        sx={triggerSx}
      >
        {deleting ? (
          <CircularProgress size={18} />
        ) : iconFontSize ? (
          <MoreVertIcon sx={{ fontSize: iconFontSize }} />
        ) : (
          <MoreVertIcon fontSize="small" />
        )}
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        <MenuItem component="a" href={openInSlicerHref} onClick={closeMenu} disabled={!openInSlicerHref}>
          <ListItemIcon><LaunchIcon fontSize="small" /></ListItemIcon>
          <ListItemText>
            {slicerOption
              ? t("models:detail.openInSlicer", { slicer: slicerOption.label })
              : t("models:detail.openInSlicerGeneric")}
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={onDownloadClick} disabled={downloading}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("common:download")}</ListItemText>
        </MenuItem>
        <MenuItem disabled>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("common:edit")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: "error.main" }}>{t("common:delete")}</ListItemText>
        </MenuItem>
        {providerInfo && print.source_url && [
          <Divider key="open-in-provider-divider" />,
          <MenuItem
            key="open-in-provider"
            component="a"
            href={print.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
          >
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("models:detail.openInProvider", { provider: providerInfo.label })}</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <DownloadPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        downloading={downloading}
        sortedPlates={sortedPlates}
        downloadAllZip={downloadAllZip}
        downloadPlate={downloadPlate}
      />
    </>
  );
}

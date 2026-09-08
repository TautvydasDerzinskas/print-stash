import { useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import CircularProgress from "@mui/material/CircularProgress";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { SxProps, Theme } from "@mui/material/styles";
import { UnauthorizedError } from "../../api/client";
import { type Plate, type Print, printsApi } from "../../api/prints";
import { saveResponseToDisk } from "../../utils/downloadResponse";
import { useConfirm } from "../../components/ConfirmProvider";
import { importProviderInfo } from "../../constants/importProviders";

type Props = {
  print: Print;
  onUnauthorized?: () => void;
  onDeleted: () => void;
  /** Lets callers restyle the trigger button -- e.g. the Models grid's hover overlay, which
   *  needs to read over an arbitrary thumbnail instead of the detail page header's plain icon. */
  triggerSx?: SxProps<Theme>;
};

/** The "..." menu for a model: Download (single file, or a plate picker / zip-all for
 *  multi-plate models), Edit (disabled for now), Delete (confirm, then delete), and -- only for
 *  an imported print -- a divider then "Open in {Provider}" linking back to the original model
 *  page. Shared by the model detail page's header and the Models/Collection grids' per-card
 *  hover overlay. */
export default function ModelActionsMenu({ print, onUnauthorized, onDeleted, triggerSx }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const confirmDialog = useConfirm();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const closeMenu = () => setAnchorEl(null);

  const handleDownloadError = (err: unknown) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return;
    }
    console.error(err);
    alert(t("models:detail.downloadFailed"));
  };

  const downloadPlate = async (plate: Plate) => {
    setDownloading(true);
    try {
      const res = await fetch(printsApi.fileUrl(plate.url));
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error("Download failed");
      await saveResponseToDisk(res, plate.filename || "download");
      setPickerOpen(false);
      printsApi.recordDownload(print.id).catch(() => {});
    } catch (err) {
      handleDownloadError(err);
    } finally {
      setDownloading(false);
    }
  };

  const downloadAllZip = async () => {
    setDownloading(true);
    try {
      const res = await printsApi.downloadZip({ print_ids: [print.id] });
      await saveResponseToDisk(res, `${print.name || "model"}.zip`);
      setPickerOpen(false);
      printsApi.recordDownload(print.id).catch(() => {});
    } catch (err) {
      handleDownloadError(err);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = () => {
    closeMenu();
    if (print.plates.length <= 1) {
      const plate = print.plates[0];
      if (plate) void downloadPlate(plate);
      return;
    }
    setPickerOpen(true);
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

  const sortedPlates = print.plates.toSorted((a, b) => a.position - b.position);
  const providerInfo = importProviderInfo(print.source_provider);

  return (
    <>
      <IconButton
        size="small"
        onClick={e => setAnchorEl(e.currentTarget)}
        aria-label={t("common:more") ?? undefined}
        disabled={deleting}
        sx={triggerSx}
      >
        {deleting ? <CircularProgress size={18} /> : <MoreVertIcon fontSize="small" />}
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        <MenuItem onClick={handleDownload} disabled={downloading}>
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

      <Dialog open={pickerOpen} onClose={() => !downloading && setPickerOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("models:detail.downloadPickerTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Button
              variant="contained"
              onClick={downloadAllZip}
              disabled={downloading}
              startIcon={downloading ? <CircularProgress size={14} /> : <DownloadIcon fontSize="small" />}
            >
              {t("models:detail.downloadAllZip", { count: sortedPlates.length })}
            </Button>
            <Divider>{t("models:detail.orDownloadOne")}</Divider>
            <List disablePadding>
              {sortedPlates.map((plate, idx) => (
                <ListItemButton
                  key={plate.id}
                  onClick={() => downloadPlate(plate)}
                  disabled={downloading}
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemText
                    primary={t("models:detail.plateLabel", { n: idx + 1 })}
                    secondary={plate.filename}
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerOpen(false)} disabled={downloading}>{t("common:cancel")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

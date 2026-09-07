import React from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import LinkIcon from "@mui/icons-material/Link";
import { useUploadImport } from "../uploads/useUploadImport";

type Props = {
  folderId?: string | null;
  makerworldCookie?: string | null;
  thingiverseCookie?: string | null;
  onUploaded: () => void;
  onUnauthorized?: () => void;
};

/** The top bar's "+ Add" button -- Upload opens the file picker directly, Import opens a
 *  small paste-a-link dialog. Both share the upload/import plumbing (and the zip / multi-plate
 *  / collection follow-up prompts it can trigger) via useUploadImport. */
export default function AddMenu({ folderId, makerworldCookie, thingiverseCookie, onUploaded, onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [linkValue, setLinkValue] = React.useState("");
  const upload = useUploadImport({ folderId, makerworldCookie, thingiverseCookie, onUploaded, onUnauthorized });

  const closeMenu = () => setAnchorEl(null);

  const handleUpload = () => {
    closeMenu();
    upload.triggerUpload();
  };

  const openImport = () => {
    closeMenu();
    setLinkValue("");
    setImportOpen(true);
  };

  const closeImport = () => {
    if (upload.importing) return;
    setImportOpen(false);
  };

  const submitImport = async () => {
    if (!linkValue.trim()) return;
    await upload.submitImport(linkValue);
    setImportOpen(false);
  };

  return (
    <>
      {upload.fileInput}
      <Button
        variant="contained"
        size="small"
        startIcon={<AddIcon fontSize="small" />}
        disabled={upload.isBusy}
        onClick={e => setAnchorEl(e.currentTarget)}
      >
        {upload.uploading ? t("uploadBar.uploading") : t("common:add")}
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        <MenuItem onClick={handleUpload}>
          <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("common:upload")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={openImport}>
          <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("common:import")}</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={importOpen} onClose={closeImport} fullWidth maxWidth="sm">
        <DialogTitle>{t("addMenu.importTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            type="url"
            margin="dense"
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitImport();
              }
            }}
            placeholder={t("uploadBar.linkPlaceholder") ?? undefined}
            disabled={upload.importing}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeImport} disabled={upload.importing}>{t("common:cancel")}</Button>
          <Button
            variant="contained"
            onClick={submitImport}
            disabled={upload.importing || !linkValue.trim()}
            startIcon={upload.importing ? <CircularProgress size={14} /> : undefined}
          >
            {upload.importing ? t("uploadBar.importing") : t("common:import")}
          </Button>
        </DialogActions>
      </Dialog>

      {upload.modals}
    </>
  );
}

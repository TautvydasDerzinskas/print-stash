import React from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import EditIcon from "@mui/icons-material/Edit";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import type { Folder } from "../../../../../services/api";

type Props = {
  folder: Folder | null;
  anchorEl: HTMLElement | null;
  busy: boolean;
  labels: {
    subfolder: string;
    renameEdit: string;
    downloadZip: string;
    delete: string;
  };
  onClose: () => void;
  onSubfolder: (folder: Folder) => void;
  onRename: (folder: Folder) => void;
  onDownload: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
};

/** The "..." row action menu (subfolder / rename / download / delete) -- a single shared
 *  Menu instance anchored to whichever row's trigger was last clicked, rather than one
 *  Menu per row. */
export default function FolderActionMenu({ folder, anchorEl, busy, labels, onClose, onSubfolder, onRename, onDownload, onDelete }: Props) {
  return (
    <Menu anchorEl={anchorEl} open={Boolean(folder) && Boolean(anchorEl)} onClose={onClose}>
      {folder && [
        <MenuItem key="subfolder" disabled={busy} onClick={() => { onClose(); onSubfolder(folder); }}>
          <ListItemIcon><CreateNewFolderIcon fontSize="small" /></ListItemIcon>
          {labels.subfolder}
        </MenuItem>,
        <MenuItem key="rename" disabled={busy} onClick={() => { onClose(); onRename(folder); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          {labels.renameEdit}
        </MenuItem>,
        <MenuItem key="download" disabled={busy} onClick={() => { onClose(); onDownload(folder); }}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          {labels.downloadZip}
        </MenuItem>,
        <Divider key="divider" />,
        <MenuItem
          key="delete"
          disabled={busy}
          onClick={() => { onClose(); onDelete(folder); }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon sx={{ color: "error.main" }}><DeleteIcon fontSize="small" /></ListItemIcon>
          {labels.delete}
        </MenuItem>,
      ]}
    </Menu>
  );
}

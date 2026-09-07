import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Button from "@mui/material/Button";
import { SCAN_EXTS } from "../../../constants/fileTypes";
import { entryKey, findRootSegment, prepareScanEntries } from "../../../utils/directoryScan";
import { UnauthorizedError } from "../../../api/client";
import { foldersApi } from "../../../api/folders";
import {
  entriesFromDirectoryHandle,
  entriesFromFileList,
  uploadEntriesToFolder,
  type DirectoryPicker,
  type FileSystemAccessDirectoryHandle,
  type UploadEntry,
} from "../../../utils/uploadTree";

type Props = {
  onAssetsChanged?: () => void;
  onFoldersChanged?: () => void;
  onUnauthorized?: () => void;
  onSelectFolder?: (id: string | null) => void;
};

/** Client-side "pick a local folder (USB included) and import its supported files" scan
 *  feature, via either the File System Access API directory picker (preferred, allows a
 *  one-click "Rescan now") or a plain <input webkitdirectory> fallback. */
export default function FolderScanPanel({ onAssetsChanged, onFoldersChanged, onUnauthorized, onSelectFolder }: Props) {
  const { t } = useTranslation("app");
  const [scanRawEntries, setScanRawEntries] = React.useState<UploadEntry[]>([]);
  const [scanEntries, setScanEntries] = React.useState<UploadEntry[]>([]);
  const [scanRoot, setScanRoot] = React.useState("");
  const [scanSkipped, setScanSkipped] = React.useState(0);
  const [scanStatus, setScanStatus] = React.useState<string | null>(null);
  const [scanBusy, setScanBusy] = React.useState(false);
  const [scanStripRoot, setScanStripRoot] = React.useState(false);
  const [scanHandle, setScanHandle] = React.useState<FileSystemAccessDirectoryHandle | null>(null);
  const [scanFolderId, setScanFolderId] = React.useState<string | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadedKeysRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute("webkitdirectory", "");
    folderInputRef.current.setAttribute("directory", "");
  }, []);

  React.useEffect(() => {
    if (!scanRawEntries.length) {
      setScanEntries([]);
      setScanSkipped(0);
      return;
    }
    const stripRoot = Boolean(scanRoot);
    const { entries, skipped } = prepareScanEntries(scanRawEntries, scanRoot, stripRoot);
    setScanEntries(entries);
    setScanSkipped(skipped);
  }, [scanRawEntries, scanRoot]);

  const recordUploadedEntries = (entries: UploadEntry[]) => {
    for (const entry of entries) {
      uploadedKeysRef.current.add(entryKey(entry));
    }
  };

  const filterNewEntries = (entries: UploadEntry[]) => {
    return entries.filter(entry => !uploadedKeysRef.current.has(entryKey(entry)));
  };

  const updateScanSelection = (
    rawEntries: UploadEntry[],
    rootLabel: string,
    stripRoot: boolean,
    resetUploaded: boolean
  ) => {
    const { entries, skipped } = prepareScanEntries(rawEntries, rootLabel, stripRoot);
    if (resetUploaded) {
      uploadedKeysRef.current = new Set();
    }
    setScanRawEntries(rawEntries);
    setScanRoot(rootLabel);
    setScanEntries(entries);
    setScanSkipped(skipped);
    return entries;
  };

  const uploadScanEntries = async (
    entries: UploadEntry[],
    note?: string,
    parentFolderId?: string | null
  ) => {
    const fresh = filterNewEntries(entries);
    if (!fresh.length) {
      setScanStatus(note || t("settings.imports.noNewFiles"));
      return;
    }
    setScanBusy(true);
    setScanStatus(t("settings.imports.uploadingStatus"));
    try {
      const result = await uploadEntriesToFolder(fresh, parentFolderId || null, onUnauthorized);
      if (result.uploadedEntries?.length) {
        recordUploadedEntries(result.uploadedEntries);
      } else if (result.uploaded) {
        recordUploadedEntries(fresh);
      }
      if (result.uploaded) {
        onAssetsChanged?.();
        onFoldersChanged?.();
      }
      if (result.failed.length) {
        setScanStatus(t("settings.imports.uploadedWithFailures", { count: result.uploaded, failed: result.failed.length }));
      } else {
        setScanStatus(t("settings.imports.uploadedStatus", { count: result.uploaded }));
      }
    } catch (err) {
      console.error("Folder scan upload failed", err);
      setScanStatus(t("settings.imports.uploadFailed"));
    } finally {
      setScanBusy(false);
    }
  };

  const ensureRootFolder = async (name: string) => {
    if (!name || scanStripRoot) {
      setScanFolderId(null);
      return null;
    }
    if (scanFolderId && scanRoot === name) return scanFolderId;
    try {
      const created = await foldersApi.create(name, [], undefined);
      const id = (created as { id: string }).id;
      setScanFolderId(id);
      return id;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return null;
      }
      console.error("Root folder creation failed", err);
      setScanStatus(t("settings.imports.rootFolderCreateFailed"));
      return null;
    }
  };

  const totalSelected = scanRawEntries.length;
  const supportedSelected = scanEntries.length;
  // uploadedKeysRef is an intentionally non-reactive dedupe set for the incremental rescan
  // feature; this count can lag a render behind a ref mutation, an acceptable tradeoff for
  // this display-only figure.
  // oxlint-disable-next-line react/refs
  const newSelected = scanEntries.length ? filterNewEntries(scanEntries).length : 0;

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>{t("settings.imports.scanHeading")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("settings.imports.scanDesc")}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t("settings.imports.scanExtensions", { extensions: SCAN_EXTS.join(", ") })}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={scanStripRoot}
              onChange={e => setScanStripRoot(e.target.checked)}
            />
          }
          label={t("settings.imports.scanSkipRootLabel")}
        />
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
          <input
            ref={folderInputRef}
            type="file"
            onChange={e => {
              const entries = entriesFromFileList(e.target.files || []);
              if (!entries.length) {
                setScanRawEntries([]);
                setScanRoot("");
                setScanStatus(null);
                setScanHandle(null);
                setScanFolderId(null);
                uploadedKeysRef.current = new Set();
                return;
              }
              const root = findRootSegment(entries);
              setScanHandle(null);
              setScanFolderId(null);
              const stripRoot = Boolean(root);
              const prepared = updateScanSelection(entries, root, stripRoot, true);
              setScanStatus(null);
              void (async () => {
                const parentFolderId = await ensureRootFolder(root);
                await uploadScanEntries(prepared, undefined, parentFolderId);
                onSelectFolder?.(parentFolderId ?? null);
              })();
              if (folderInputRef.current) folderInputRef.current.value = "";
            }}
            multiple
            hidden
          />
          <Button
            size="small"
            variant="outlined"
            disabled={scanBusy}
            onClick={async () => {
              const picker = typeof window !== "undefined"
                && (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
              if (picker) {
                try {
                  const handle = await picker();
                  const entries = await entriesFromDirectoryHandle(handle);
                  if (!entries.length) {
                    setScanRawEntries([]);
                    setScanRoot(handle.name || "");
                    setScanHandle(handle);
                    setScanFolderId(null);
                    uploadedKeysRef.current = new Set();
                    setScanStatus(t("settings.imports.noFilesFoundInFolder"));
                    return;
                  }
                  setScanHandle(handle);
                  setScanFolderId(null);
                  const rootLabel = handle.name || findRootSegment(entries);
                  const stripRoot = Boolean(rootLabel);
                  const prepared = updateScanSelection(entries, rootLabel, stripRoot, true);
                  setScanStatus(null);
                  void (async () => {
                    const parentFolderId = await ensureRootFolder(rootLabel);
                    await uploadScanEntries(prepared, undefined, parentFolderId);
                    onSelectFolder?.(parentFolderId ?? null);
                  })();
                  return;
                } catch (err) {
                  if (err instanceof DOMException && err.name === "AbortError") {
                    return;
                  }
                  console.warn("Directory picker failed, falling back to file input", err);
                }
              }
              if (folderInputRef.current) {
                folderInputRef.current.setAttribute("webkitdirectory", "");
                folderInputRef.current.setAttribute("directory", "");
              }
              folderInputRef.current?.click();
            }}
          >
            {t("settings.imports.chooseFolder")}
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={scanBusy || supportedSelected === 0}
            onClick={async () => {
              if (scanHandle) {
                const freshEntries = await entriesFromDirectoryHandle(scanHandle);
                if (!freshEntries.length) {
                  setScanRawEntries([]);
                  setScanRoot(scanHandle.name || "");
                  setScanEntries([]);
                  setScanSkipped(0);
                  setScanStatus(t("settings.imports.noFilesFoundInFolder"));
                  uploadedKeysRef.current = new Set();
                  setScanFolderId(null);
                  return;
                }
                const rootLabel = scanHandle.name || findRootSegment(freshEntries) || scanRoot;
                const stripRoot = Boolean(rootLabel);
                const prepared = updateScanSelection(freshEntries, rootLabel, stripRoot, false);
                const parentFolderId = await ensureRootFolder(rootLabel);
                await uploadScanEntries(prepared, t("settings.imports.noNewFiles"), parentFolderId);
                onSelectFolder?.(parentFolderId ?? null);
                return;
              }
              if (!scanEntries.length) {
                setScanStatus(t("settings.imports.noSupportedFiles"));
                return;
              }
              const parentFolderId = await ensureRootFolder(scanRoot);
              await uploadScanEntries(scanEntries, t("settings.imports.noNewFiles"), parentFolderId);
              onSelectFolder?.(parentFolderId ?? null);
            }}
          >
            {scanBusy
              ? t("settings.imports.uploadingStatus")
              : scanRawEntries.length
              ? t("settings.imports.rescanNow")
              : t("settings.imports.scanNow")}
          </Button>
          <Button
            size="small"
            disabled={scanBusy || totalSelected === 0}
            onClick={() => {
              setScanRawEntries([]);
              setScanRoot("");
              setScanStatus(null);
              setScanHandle(null);
              setScanFolderId(null);
              uploadedKeysRef.current = new Set();
            }}
          >
            {t("settings.imports.clear")}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {totalSelected
            ? t("settings.imports.selectedSummary", {
                total: totalSelected,
                fromSuffix: scanRoot ? t("settings.imports.fromSuffix", { root: scanRoot }) : "",
                ready: supportedSelected,
                fresh: newSelected,
                skipped: scanSkipped,
              })
            : t("settings.imports.noFolderSelected")}
        </Typography>
        {scanStatus && (
          <Typography variant="caption" fontWeight={600}>{scanStatus}</Typography>
        )}
      </Stack>
    </Paper>
  );
}

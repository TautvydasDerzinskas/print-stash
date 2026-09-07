import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DriveFolderUploadIcon from "@mui/icons-material/DriveFolderUpload";
import LinkIcon from "@mui/icons-material/Link";
import { UnauthorizedError } from "../../api/client";
import { importsApi } from "../../api/imports";
import { printsApi } from "../../api/prints";
import { entriesFromFileList, uploadEntriesToFolder } from "../../utils/uploadTree";
import { buildUploadEntriesFromZip, isZipFile, readZipEntries } from "../../utils/zipUtils";
import { useZipImportPrompt } from "./ZipImportModal";
import { useCollectionImportPrompt } from "./CollectionImportModal";
import { useImportModePrompt, type ImportMode } from "./ImportModeModal";

/** MakerWorld collection URLs (`/en/collections/{id}-{slug}`) list many models rather than
 * being one model page -- route those to the collection picker instead of the single-link
 * inspect/zip flow. */
function isMakerworldCollectionUrl(url: string): boolean {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().endsWith("makerworld.com") && /\/collections\/\d+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

// Every dropped/picked entry's relativePath equals its bare filename when the
// selection has no folder structure. A webkitdirectory folder pick always
// prefixes relativePath with the folder name, so this only ever fires for a
// flat multi-file picker selection.
function isFlatFileSet(entries: { file: File; relativePath: string }[]) {
  return entries.length > 1 && entries.every(entry => entry.relativePath === entry.file.name);
}

type Props = {
  onUploaded: () => void;
  folderId?: string | null;
  makerworldCookie?: string | null;
  thingiverseCookie?: string | null;
  onUnauthorized?: () => void;
};

export default function UploadBar({ onUploaded, folderId, makerworldCookie, thingiverseCookie, onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const zipPrompt = useZipImportPrompt();
  const collectionPrompt = useCollectionImportPrompt();
  const importModePrompt = useImportModePrompt();
  const isBusy = uploading || importing || zipPrompt.isOpen || collectionPrompt.isOpen || importModePrompt.isOpen;

  const uploadFlatAsMultiplate = async (files: File[]) => {
    try {
      const result = await printsApi.upload(files, { folder_id: folderId || undefined, mode: "multiplate" });
      return { uploaded: result.prints.length, failed: [] as string[] };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return { uploaded: 0, failed: [] as string[] };
      }
      const message = err instanceof Error ? err.message.trim() : "";
      return {
        uploaded: 0,
        failed: [
          message
            ? t("uploadBar.multiplateImportFailedWithMessage", { message })
            : t("uploadBar.multiplateImportFailed"),
        ],
      };
    }
  };

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute("webkitdirectory", "");
    folderInputRef.current.setAttribute("directory", "");
  }, []);

  const uploadEntries = async (entries: ReturnType<typeof entriesFromFileList>) => {
    if (!entries.length) return;
    setUploading(true);
    const normalEntries = entries.filter(entry => !isZipFile(entry.file.name));
    const zipEntries = entries.filter(entry => isZipFile(entry.file.name));
    let uploaded = 0;
    const failed: string[] = [];
    const applyResult = (result: { uploaded: number; failed: string[] }) => {
      uploaded += result.uploaded;
      failed.push(...result.failed);
    };
    if (normalEntries.length) {
      if (isFlatFileSet(normalEntries)) {
        await importModePrompt.prompt({
          label: normalEntries.map(entry => entry.file.name).join(", "),
          count: normalEntries.length,
          onChoose: async (mode: ImportMode) => {
            if (mode === "multiplate") {
              applyResult(await uploadFlatAsMultiplate(normalEntries.map(entry => entry.file)));
            } else {
              applyResult(await uploadEntriesToFolder(normalEntries, folderId || null, onUnauthorized));
            }
          },
        });
      } else {
        const result = await uploadEntriesToFolder(normalEntries, folderId || null, onUnauthorized);
        applyResult(result);
      }
    }
    for (const entry of zipEntries) {
      let zipData: Record<string, Uint8Array> | null = null;
      const baseParts = entry.relativePath.split("/").filter(Boolean);
      baseParts.pop();
      const basePath = baseParts.join("/");
      await zipPrompt.prompt({
        label: entry.file.name,
        onImportAsZip: async () => {
          const result = await uploadEntriesToFolder([entry], folderId || null, onUnauthorized);
          applyResult(result);
        },
        loadEntries: async () => {
          const result = await readZipEntries(entry.file);
          zipData = result.data;
          return result.entries;
        },
        onImportSelected: async (selectedPaths: string[]) => {
          if (!zipData) {
            const result = await readZipEntries(entry.file);
            zipData = result.data;
          }
          const unzipEntries = buildUploadEntriesFromZip(zipData || {}, selectedPaths, basePath);
          const result = await uploadEntriesToFolder(unzipEntries, folderId || null, onUnauthorized);
          applyResult(result);
        },
      });
    }
    if (uploaded) onUploaded();
    if (failed.length) {
      alert(t("uploadBar.uploadFailed", { files: failed.join(", ") }));
    }
    setUploading(false);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const entries = entriesFromFileList(e.target.files || []);
    if (!entries.length) return;
    await uploadEntries(entries);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPickFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const entries = entriesFromFileList(e.target.files || []);
    if (!entries.length) return;
    await uploadEntries(entries);
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const onImport = async () => {
    const url = linkValue.trim();
    if (!url) return;
    setImporting(true);
    try {
      const cookie = (makerworldCookie || "").trim();
      const thingiverse = (thingiverseCookie || "").trim();
      const payload = {
        url,
        folder_id: folderId || undefined,
        makerworld_cookie: cookie || undefined,
        thingiverse_cookie: thingiverse || undefined,
      };

      if (isMakerworldCollectionUrl(url)) {
        setImporting(false);
        await collectionPrompt.prompt({
          label: url,
          loadEntries: async () => {
            try {
              return await importsApi.listCollectionEntries(payload);
            } catch (err) {
              if (err instanceof UnauthorizedError) onUnauthorized?.();
              throw err;
            }
          },
          onImportSelected: async (designIds: string[]) => {
            try {
              const result = await importsApi.fromCollection({ ...payload, design_ids: designIds });
              if (result.failed.length) {
                alert(t("uploadBar.importFailedList", { files: result.failed.join(", ") }));
              }
            } catch (err) {
              if (err instanceof UnauthorizedError) {
                onUnauthorized?.();
                return;
              }
              throw err;
            }
            setLinkValue("");
            onUploaded();
          },
        });
        return;
      }

      const inspect = await importsApi.inspectLink(payload);
      if (!inspect.is_zip) {
        await importsApi.fromLink(payload);
        setLinkValue("");
        onUploaded();
        return;
      }
      setImporting(false);
      await zipPrompt.prompt({
        label: inspect.filename,
        onImportAsZip: async () => {
          try {
            await importsApi.fromLink(payload);
          } catch (err) {
            if (err instanceof UnauthorizedError) {
              onUnauthorized?.();
              return;
            }
            throw err;
          }
          setLinkValue("");
          onUploaded();
        },
        loadEntries: async () => {
          try {
            const result = await importsApi.listZipEntries(payload);
            return result.entries;
          } catch (err) {
            if (err instanceof UnauthorizedError) {
              onUnauthorized?.();
            }
            throw err;
          }
        },
        onImportSelected: async (entries: string[]) => {
          try {
            const result = await importsApi.zipFromLink({ ...payload, entries });
            if (result.failed.length) {
              alert(t("uploadBar.importFailedList", { files: result.failed.join(", ") }));
            }
          } catch (err) {
            if (err instanceof UnauthorizedError) {
              onUnauthorized?.();
              return;
            }
            throw err;
          }
          setLinkValue("");
          onUploaded();
        },
      });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error("Import failed for", url, err);
      const message = err instanceof Error ? err.message : t("uploadBar.importFailed");
      alert(message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="file"
          onChange={onPick}
          multiple
          accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,.svg,.stl,.step,.stp,.3mf,.lbrn,.lbrn2,.zip"
          hidden
        />
        <input ref={folderInputRef} type="file" onChange={onPickFolder} multiple hidden />
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          disabled={isBusy}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? t("uploadBar.uploading") : t("uploadBar.upload")}
        </Button>
        <Button
          variant="outlined"
          startIcon={<DriveFolderUploadIcon />}
          disabled={isBusy}
          onClick={() => folderInputRef.current?.click()}
        >
          {uploading ? t("uploadBar.uploading") : t("uploadBar.uploadFolder")}
        </Button>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TextField
            type="url"
            size="small"
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                onImport();
              }
            }}
            placeholder={t("uploadBar.linkPlaceholder") ?? undefined}
            disabled={isBusy}
            sx={{ width: 320 }}
          />
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            disabled={isBusy || !linkValue.trim()}
            onClick={onImport}
          >
            {importing ? t("uploadBar.importing") : t("uploadBar.importLink")}
          </Button>
        </Box>
      </Box>
      {zipPrompt.modal}
      {collectionPrompt.modal}
      {importModePrompt.modal}
    </>
  );
}

import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UnauthorizedError } from "../../api/client";
import { importsApi } from "../../api/imports";
import { printsApi } from "../../api/prints";
import { entriesFromFileList, uploadEntriesToFolder } from "../../utils/uploadTree";
import { buildUploadEntriesFromZip, isZipFile, readZipEntries } from "../../utils/zipUtils";
import { useZipImportPrompt } from "./ZipImportModal";
import { useCollectionImportPrompt } from "./CollectionImportModal";
import { useImportModePrompt, type ImportMode } from "./ImportModeModal";
import { useImportJob } from "../Layout/ImportJobContext";
import { useToast } from "../ToastProvider";

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

/** A Thingiverse Thing import goes through its own backend path entirely (see
 * importService.ts's importThingiverseThing) rather than the generic inspect/zip-picker flow --
 * skip straight to a plain import call so the zip-entry picker (meant for arbitrary remote
 * zips) never shows up for one. Every recognized model file on the Thing becomes its own plate
 * automatically. */
function isThingiverseThingUrl(url: string): boolean {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    if (host !== "thingiverse.com" && host !== "www.thingiverse.com") return false;
    return /thing:\d+/i.test(parsed.pathname) || /\/things\/\d+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** A Thingiverse user's own "Likes" page (`thingiverse.com/{username}/likes`) -- the site's own
 * bookmark/save mechanism many people use to collect prints worth making. Lists many Things
 * rather than being one Thing page, so route it to the same collection picker MakerWorld
 * collections use. */
function isThingiverseLikesUrl(url: string): boolean {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    if (host !== "thingiverse.com" && host !== "www.thingiverse.com") return false;
    return /^\/[^/]+\/likes\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** A user-curated, named Thingiverse Collection (`thingiverse.com/{username}/collections/{id}`,
 * optionally with a trailing `/things`) -- the site's other bookmark mechanism besides the
 * automatic Likes list above. Also routed to the collection picker. */
function isThingiverseCollectionUrl(url: string): boolean {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    if (host !== "thingiverse.com" && host !== "www.thingiverse.com") return false;
    return /\/collections\/\d+/i.test(parsed.pathname);
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
  onUnauthorized?: () => void;
};

/** Backs the top bar's "+ Add" menu -- Upload opens a hidden file input, Import opens a
 *  paste-a-link dialog. Both funnel into the same zip/multi-plate/collection prompts used
 *  elsewhere in the app, so `modals` must be rendered by the caller alongside the menu. */
export function useUploadImport({ onUploaded, folderId, makerworldCookie, onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const showToast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const zipPrompt = useZipImportPrompt();
  const collectionPrompt = useCollectionImportPrompt();
  const importModePrompt = useImportModePrompt();
  const { startCollectionImport, startZipImport, startThingiverseLikesImport, startThingiverseCollectionImport } = useImportJob();
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

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const entries = entriesFromFileList(e.target.files || []);
    if (entries.length) await uploadEntries(entries);
    if (inputRef.current) inputRef.current.value = "";
  };

  const triggerUpload = () => inputRef.current?.click();

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      onChange={onFilePick}
      multiple
      accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,.svg,.stl,.step,.stp,.3mf,.lbrn,.lbrn2,.zip"
      hidden
    />
  );

  const submitImport = async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const cookie = (makerworldCookie || "").trim();
      const payload = {
        url,
        folder_id: folderId || undefined,
        makerworld_cookie: cookie || undefined,
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
            // Registers the batch as a background job and returns almost immediately -- the
            // global progress bar (ImportJobContext) takes over from here, and a notification
            // + grid refresh follow once it actually finishes.
            try {
              await startCollectionImport({ ...payload, design_ids: designIds });
            } catch (err) {
              if (err instanceof UnauthorizedError) {
                onUnauthorized?.();
                return;
              }
              throw err;
            }
          },
        });
        return;
      }

      if (isThingiverseLikesUrl(url)) {
        setImporting(false);
        await collectionPrompt.prompt({
          label: url,
          loadEntries: async () => {
            try {
              return await importsApi.listThingiverseLikesEntries(payload);
            } catch (err) {
              if (err instanceof UnauthorizedError) onUnauthorized?.();
              throw err;
            }
          },
          onImportSelected: async (thingIds: string[]) => {
            try {
              await startThingiverseLikesImport({ ...payload, thing_ids: thingIds });
            } catch (err) {
              if (err instanceof UnauthorizedError) {
                onUnauthorized?.();
                return;
              }
              throw err;
            }
          },
        });
        return;
      }

      if (isThingiverseCollectionUrl(url)) {
        setImporting(false);
        await collectionPrompt.prompt({
          label: url,
          loadEntries: async () => {
            try {
              return await importsApi.listThingiverseCollectionEntries(payload);
            } catch (err) {
              if (err instanceof UnauthorizedError) onUnauthorized?.();
              throw err;
            }
          },
          onImportSelected: async (thingIds: string[]) => {
            try {
              await startThingiverseCollectionImport({ ...payload, thing_ids: thingIds });
            } catch (err) {
              if (err instanceof UnauthorizedError) {
                onUnauthorized?.();
                return;
              }
              throw err;
            }
          },
        });
        return;
      }

      if (isThingiverseThingUrl(url)) {
        // A Thing always resolves to a zip; skip straight past the inspect/zip-picker steps --
        // the backend already splits it into plates automatically.
        const imported = await importsApi.fromLink(payload);
        showToast({ message: t("uploadBar.imported", { name: imported.title || imported.name }) });
        onUploaded();
        return;
      }

      const inspect = await importsApi.inspectLink(payload);
      if (!inspect.is_zip) {
        const imported = await importsApi.fromLink(payload);
        showToast({ message: t("uploadBar.imported", { name: imported.title || imported.name }) });
        onUploaded();
        return;
      }
      setImporting(false);
      await zipPrompt.prompt({
        label: inspect.filename,
        onImportAsZip: async () => {
          try {
            const imported = await importsApi.fromLink(payload);
            showToast({ message: t("uploadBar.imported", { name: imported.title || imported.name }) });
          } catch (err) {
            if (err instanceof UnauthorizedError) {
              onUnauthorized?.();
              return;
            }
            throw err;
          }
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
          // Same deal as the collection branch above: hands off to the background job +
          // global progress bar instead of blocking here.
          try {
            await startZipImport({ ...payload, entries });
          } catch (err) {
            if (err instanceof UnauthorizedError) {
              onUnauthorized?.();
              return;
            }
            throw err;
          }
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

  return {
    fileInput,
    uploading,
    importing,
    isBusy,
    triggerUpload,
    submitImport,
    modals: (
      <>
        {zipPrompt.modal}
        {collectionPrompt.modal}
        {importModePrompt.modal}
      </>
    ),
  };
}

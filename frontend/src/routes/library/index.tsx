import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import ButtonBase from "@mui/material/ButtonBase";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import {
  Print,
  Folder,
  UnauthorizedError,
  deletePrint,
  fileUrl,
  listPrints,
  listTags,
  listFolders,
  setTags,
  updatePrintFolder,
  updatePrintMeta,
  downloadZip,
  uploadPrints,
} from "../../services/api";
import PrintCard from "./components/PrintCard";
import PrintPreviewModal from "./components/PrintPreviewModal";
import { colorForTag } from "../../utils/tagColors";
import { EngravingSettings, PreviewSettings, SlicerSettings } from "../../services/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { engraverLabelFor, slicerLabelFor } from "../../utils/settingsHelpers";
import { SLICER_BRIDGE_ENABLED } from "../../constants/featureFlags";
import { entriesFromDataTransfer, uploadEntriesToFolder } from "../../services/uploadTree";
import { buildUploadEntriesFromZip, isZipFile, readZipEntries } from "../../services/zipUtils";
import { useZipImportPrompt } from "./components/ZipImportModal";
import { useImportModePrompt, type ImportMode } from "./components/ImportModeModal";
import { extOf } from "../../utils/fileExtensions";

const ROWS_PER_BATCH = 5;
const CARD_MIN_WIDTH_PX = 260;
const GRID_GAP_PX = 16;

function rowsBatchSizeForWidth(width: number) {
  const cols = Math.max(1, Math.floor((width + GRID_GAP_PX) / (CARD_MIN_WIDTH_PX + GRID_GAP_PX)));
  return cols * ROWS_PER_BATCH;
}

// Every dropped/picked entry's relativePath equals its bare filename when the
// selection has no folder structure -- that's the signal for the
// separate-vs-multiplate prompt (a dropped folder, or the webkitdirectory
// picker, always carries nested relativePaths and skips this prompt).
function isFlatFileSet(entries: { file: File; relativePath: string }[]) {
  return entries.length > 1 && entries.every(entry => entry.relativePath === entry.file.name);
}

type Props = {
  folderId?: string | null;
  foldersVersion?: number;
  onUnauthorized?: () => void;
  slicerSettings?: SlicerSettings;
  engravingSettings?: EngravingSettings;
  previewSettings?: PreviewSettings;
  theme: ResolvedTheme;
};

type RefreshOpts = { tags?: string[]; search?: string };
type GroupBucket = { id: string; title: string; items: Print[] };

export default function PrintGrid({
  folderId,
  foldersVersion = 0,
  onUnauthorized,
  slicerSettings,
  engravingSettings,
  previewSettings,
  theme,
}: Props) {
  const { t, i18n } = useTranslation(["library", "common"]);
  const [items, setItems] = useState<Print[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [previewItem, setPreviewItem] = useState<Print | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"name" | "size" | "type" | "folder">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState<string | null>(null);
  const [pageSize] = useState<number>(() => {
    if (typeof window === "undefined") return ROWS_PER_BATCH;
    return rowsBatchSizeForWidth(window.innerWidth);
  });
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);
  const slicerEnabled = SLICER_BRIDGE_ENABLED && Boolean(slicerSettings?.enabled);
  const slicerLabel = slicerLabelFor(slicerSettings?.selected);
  const engravingEnabled = Boolean(engravingSettings?.enabled);
  const engraverLabel = engraverLabelFor(engravingSettings?.selected);
  const zipPrompt = useZipImportPrompt();
  const importModePrompt = useImportModePrompt();

  const handleApiError = (err: unknown, message?: string) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return true;
    }
    console.error(err);
    if (message) alert(message);
    return false;
  };

  const replacePrint = (updated: Print) => {
    setItems(current => current.map(item => item.id === updated.id ? updated : item));
    setPreviewItem(current => current?.id === updated.id ? updated : current);
  };

  const refresh = async (opts: RefreshOpts = {}) => {
    setLoading(true);
    setHasMore(false);
    setOffset(0);
    const search = opts.search ?? q;
    const tags = opts.tags ?? activeTags;
    const targetFolderId = folderId || undefined;
    const [printsResult, tagsResult] = await Promise.allSettled([
      listPrints({
        q: search,
        tags,
        folder_id: targetFolderId,
        limit: pageSize,
        offset: 0,
      }),
      listTags({
        q: search,
        folder_id: targetFolderId,
      }),
    ]);

    if (printsResult.status === "fulfilled") {
      setItems(printsResult.value.items);
      setOffset(printsResult.value.items.length);
      setHasMore(printsResult.value.hasMore);
    } else {
      handleApiError(printsResult.reason, t("library:errors.loadPrintsFailed"));
    }

    if (tagsResult.status === "fulfilled") {
      setAllTags(tagsResult.value);
    } else {
      setAllTags([]);
      handleApiError(tagsResult.reason);
    }

    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await listPrints({
        q,
        tags: activeTags,
        folder_id: folderId || undefined,
        limit: pageSize,
        offset,
      });
      setItems(prev => [...prev, ...data.items]);
      setOffset(offset + data.items.length);
      setHasMore(data.hasMore);
    } catch (err) {
      handleApiError(err, t("library:errors.loadMoreFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const isFileDrag = (e: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.includes("Files");
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  };

  const uploadFlatAsMultiplate = async (files: File[], targetFolderId: string | null) => {
    try {
      const result = await uploadPrints(files, { folder_id: targetFolderId || undefined, mode: "multiplate" });
      return { uploaded: result.prints.length, failed: [] as string[] };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return { uploaded: 0, failed: [] as string[] };
      }
      const message = err instanceof Error ? err.message.trim() : "";
      const failure = message
        ? t("library:errors.multiplateImportFailedWithMessage", { message })
        : t("library:errors.multiplateImportFailed");
      return { uploaded: 0, failed: [failure] };
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    setDropUploading(true);
    const entries = await entriesFromDataTransfer(e.dataTransfer);
    if (!entries.length) {
      setDropUploading(false);
      return;
    }
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
              applyResult(await uploadFlatAsMultiplate(normalEntries.map(entry => entry.file), folderId || null));
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
    if (uploaded) {
      await refresh();
    }
    if (failed.length) {
      alert(t("library:errors.uploadFailed", { items: failed.join(", ") }));
    }
    setDropUploading(false);
  };

  useEffect(() => { refresh(); }, [folderId]);
  useEffect(() => {
    (async () => {
      try {
        setFolders(await listFolders());
      } catch (err) {
        handleApiError(err, t("library:errors.loadFoldersFailed"));
      }
    })();
  }, [foldersVersion]);

  useEffect(() => {
    const present = new Set(items.map(i => i.id));
    setSelectedIds(prev => new Set([...prev].filter(id => present.has(id))));
  }, [items]);

  const itemById = useMemo(() => {
    const map: Record<string, Print> = {};
    items.forEach(it => { map[it.id] = it; });
    return map;
  }, [items]);

  const folderById = useMemo(() => {
    const map: Record<string, Folder> = {};
    folders.forEach(f => { map[f.id] = f; });
    return map;
  }, [folders]);

  const dropTargetName = useMemo(() => {
    if (!folderId) return t("library:grid.allItems");
    return folderById[folderId]?.name || t("library:grid.thisFolder");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, folderById, i18n.language]);

  const folderNames = useMemo(() => {
    const m: Record<string, string> = {};
    const untitled = t("library:grid.groupUntitled");
    const pathFor = (f: Folder): string => {
      const parts = [f.name || untitled];
      let current = f;
      const guard = new Set<string>([f.id]);
      while (current.parent_id) {
        const parent = folderById[current.parent_id];
        if (!parent || guard.has(parent.id)) break;
        parts.unshift(parent.name || untitled);
        guard.add(parent.id);
        current = parent;
      }
      return parts.join(" / ");
    };
    for (const f of folders) {
      m[f.id] = pathFor(f);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, folderById, i18n.language]);

  const folderOptions = useMemo(() => {
    return [
      { id: null as string | null, name: t("common:unassigned") },
      ...folders
        .map(f => ({ id: f.id, name: folderNames[f.id] || f.name || t("library:grid.groupUntitled") }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, folderNames, i18n.language]);

  const totalSize = (print: Print) => print.plates.reduce((sum, plate) => sum + (plate.size || 0), 0);
  const primaryExt = (print: Print) => extOf(print.plates[0]?.filename || "");

  const sortedItems = useMemo(() => {
    const copy = [...items];
    const dir = sortDir === "asc" ? 1 : -1;
    const nameForFolder = (a: Print) => (a.folder_id ? folderNames[a.folder_id] || "" : "");
    copy.sort((a, b) => {
      if (sortKey === "size") {
        return (totalSize(a) - totalSize(b)) * dir;
      }
      if (sortKey === "type") {
        return primaryExt(a).localeCompare(primaryExt(b)) * dir;
      }
      if (sortKey === "folder") {
        return nameForFolder(a).localeCompare(nameForFolder(b)) * dir;
      }
      // default name
      return a.name.localeCompare(b.name) * dir;
    });
    return copy;
  }, [items, sortKey, sortDir, folderNames]);

  const folderGroups = useMemo<GroupBucket[]>(() => {
    if (sortKey !== "folder") return [];
    const grouping: Record<string, GroupBucket> = {};
    for (const item of items) {
      const key = item.folder_id || "__ungrouped";
      if (!grouping[key]) {
        grouping[key] = {
          id: `folder:${key}`,
          title: item.folder_id ? folderNames[item.folder_id] || t("library:grid.groupUntitled") : t("library:grid.groupUngrouped"),
          items: [],
        };
      }
      grouping[key].items.push(item);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return Object.values(grouping)
      .sort((a, b) => a.title.localeCompare(b.title) * dir)
      .map(group => ({
        ...group,
        items: group.items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, folderNames, sortKey, sortDir, i18n.language]);

  const typeGroups = useMemo<GroupBucket[]>(() => {
    if (sortKey !== "type") return [];
    const grouping: Record<string, GroupBucket> = {};
    for (const item of items) {
      const ext = primaryExt(item) || "other";
      if (!grouping[ext]) {
        grouping[ext] = {
          id: `type:${ext}`,
          title: ext === "other" ? t("library:grid.groupOther") : ext.toUpperCase(),
          items: [],
        };
      }
      grouping[ext].items.push(item);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return Object.values(grouping)
      .sort((a, b) => a.title.localeCompare(b.title) * dir)
      .map(group => ({
        ...group,
        items: group.items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortKey, sortDir, i18n.language]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    setActiveTags(prev => {
      const next = prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag];
      refresh({ tags: next });
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filenameFromDisposition = (res: Response, fallback: string) => {
    const dispo = res.headers.get("content-disposition") || "";
    const match = dispo.match(/filename="?([^";]+)"?/i);
    return (match && match[1]) || fallback || "download";
  };

  const saveResponseToDisk = async (res: Response, fallback: string) => {
    const filename = filenameFromDisposition(res, fallback);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const onSaveTags = async (id: string, tags: string[]) => {
    const bulkEdit = selectedIds.has(id) && selectedIds.size > 1;
    const targets = bulkEdit ? Array.from(selectedIds) : [id];
    const failed: string[] = [];
    let aborted = false;
    for (const targetId of targets) {
      try {
        await setTags(targetId, tags);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized?.();
          aborted = true;
          break;
        }
        console.error(err);
        failed.push(itemById[targetId]?.name || targetId);
      }
    }
    if (!aborted) {
      await refresh();
      if (bulkEdit) {
        setSelectedIds(new Set());
      }
    }
    if (failed.length) {
      alert(t("library:errors.tagUpdateFailed", { items: failed.join(", ") }));
    }
  };

  const onSaveDetails = async (id: string, payload: { notes: string; creator: string; collection: string }) => {
    try {
      await updatePrintMeta(id, payload);
      await refresh();
    } catch (err) {
      handleApiError(err, err instanceof Error ? err.message : t("library:errors.saveDetailsFailed"));
    }
  };

  const onRename = async (id: string, name: string) => {
    try {
      await updatePrintMeta(id, { name });
      await refresh();
    } catch (err) {
      handleApiError(err, err instanceof Error ? err.message : t("library:errors.renameFailed"));
      throw err;
    }
  };

  const onMoveFolder = async (id: string, folder_id: string | null) => {
    try {
      setMovingId(id);
      await updatePrintFolder(id, folder_id);
      await refresh();
    } catch (err) {
      if (!handleApiError(err)) {
        alert(err instanceof Error ? err.message : t("library:errors.folderUpdateFailed"));
      }
    } finally {
      setMovingId(null);
    }
  };

  const downloadPrint = async (print: Print) => {
    try {
      setDownloadingId(print.id);
      if (print.plates.length > 1) {
        const res = await downloadZip({ print_ids: [print.id] });
        await saveResponseToDisk(res, `${print.name || "print"}.zip`);
        return;
      }
      const plate = print.plates[0];
      if (!plate) throw new Error("Download failed");
      const res = await fetch(fileUrl(plate.url));
      if (res.status === 401) {
        onUnauthorized?.();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error("Download failed");
      await saveResponseToDisk(res, plate.filename || "download");
    } catch (err) {
      if (!handleApiError(err)) {
        console.error(err);
        alert(t("library:errors.downloadFailed"));
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const openInSlicer = (print: Print) => {
    if (!SLICER_BRIDGE_ENABLED || !slicerEnabled) return;
    const plate = print.plates[0];
    const url = fileUrl(print.slicer_url || plate?.url || "");
    const params = new URLSearchParams({
      url,
      slicer: slicerSettings?.selected || "orca",
      filename: print.slicer_filename || plate?.filename || "model",
    });
    const target = `printstash-slicer://open?${params.toString()}`;
    window.location.href = target;
  };

  const openInEngraving = (print: Print) => {
    if (!engravingEnabled) return;
    const plate = print.plates[0];
    if (!plate) return;
    const url = fileUrl(plate.url);
    const params = new URLSearchParams({
      url,
      engraver: engravingSettings?.selected || "lightburn",
      filename: plate.filename || "design",
    });
    const target = `printstash-engrave://open?${params.toString()}`;
    window.location.href = target;
  };

  const downloadSelected = async () => {
    if (!selectedIds.size) {
      alert(t("library:errors.selectAtLeastOne"));
      return;
    }
    try {
      setBulkDownloading("selected");
      const res = await downloadZip({ print_ids: Array.from(selectedIds) });
      await saveResponseToDisk(res, "printstash-selected.zip");
    } catch (err) {
      if (!handleApiError(err, t("library:errors.bulkDownloadFailed"))) {
        console.error(err);
      }
    } finally {
      setBulkDownloading(null);
    }
  };

  const downloadByTag = async (tag: string) => {
    if (!tag) return;
    try {
      setBulkDownloading(`tag:${tag}`);
      const res = await downloadZip({ tag });
      await saveResponseToDisk(res, `${tag}.zip`);
    } catch (err) {
      if (!handleApiError(err, t("library:errors.downloadByTagFailed"))) {
        console.error(err);
      }
    } finally {
      setBulkDownloading(null);
    }
  };

  const removePrint = async (print: Print) => {
    const targets = selectedIds.has(print.id) && selectedIds.size > 1
      ? Array.from(selectedIds)
      : [print.id];
    const confirmLabel = targets.length > 1
      ? t("library:confirm.deleteMultiple", { count: targets.length })
      : t("library:confirm.deleteSingle", { name: print.title || print.name });
    if (!confirm(confirmLabel)) {
      return;
    }
    setDeletingId(print.id);
    const failed: string[] = [];
    let aborted = false;
    for (const targetId of targets) {
      try {
        await deletePrint(targetId);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized?.();
          aborted = true;
          break;
        }
        console.error(err);
        failed.push(itemById[targetId]?.name || targetId);
      }
    }
    if (!aborted) {
      await refresh();
    }
    if (failed.length) {
      alert(t("library:errors.deleteFailed", { items: failed.join(", ") }));
    }
    setDeletingId(null);
  };

  const showDropOverlay = dragActive || dropUploading;
  const dropMessage = dropUploading
    ? t("library:dropOverlay.uploading", { target: dropTargetName })
    : t("library:dropOverlay.prompt", { target: dropTargetName });

  const sortOptions: { value: typeof sortKey; label: string }[] = [
    { value: "name", label: t("library:grid.sortOptions.name") },
    { value: "size", label: t("library:grid.sortOptions.size") },
    { value: "type", label: t("library:grid.sortOptions.type") },
    { value: "folder", label: t("library:grid.sortOptions.folder") },
  ];

  return (
      <Box
        sx={{ position: "relative" }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {showDropOverlay && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 2,
              border: "2px dashed",
              borderColor: "primary.main",
              bgcolor: "rgba(0, 0, 0, 0.35)",
              pointerEvents: "none",
            }}
          >
            <Paper elevation={4} sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2">{dropMessage}</Typography>
            </Paper>
          </Box>
        )}
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const val = (e.currentTarget as HTMLInputElement).value;
                  refresh({ search: val });
                }
              }}
              placeholder={t("library:grid.searchPlaceholder")}
              sx={{ width: 320 }}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={<SearchIcon fontSize="small" />}
              onClick={() => refresh({ search: q })}
              disabled={loading}
            >
              {t("library:grid.search")}
            </Button>
            {loading && (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">{t("library:grid.loading")}</Typography>
              </Stack>
            )}
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" color="text.secondary">{t("library:grid.sortLabel")}</Typography>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <Select
                  value={sortKey}
                  onChange={(e: SelectChangeEvent) => setSortKey(e.target.value as typeof sortKey)}
                >
                  {sortOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                size="small"
                startIcon={sortDir === "asc" ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                onClick={() => setSortDir(prev => (prev === "asc" ? "desc" : "asc"))}
              >
                {sortDir === "asc" ? t("library:grid.sortAsc") : t("library:grid.sortDesc")}
              </Button>
            </Stack>
          </Stack>

          {!!allTags.length && (
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
              {allTags.map(tg => {
                const colors = colorForTag(tg);
                const active = activeTags.includes(tg);
                return (
                  <Chip
                    key={tg}
                    label={tg}
                    size="small"
                    clickable
                    onClick={() => toggleTag(tg)}
                    sx={{
                      bgcolor: active ? colors.bg : "transparent",
                      color: colors.text,
                      border: "1px solid",
                      borderColor: colors.border,
                      fontWeight: active ? 600 : 400,
                    }}
                  />
                );
              })}
              {activeTags.length > 0 && (
                <Chip
                  label={t("library:grid.resetTags")}
                  size="small"
                  variant="outlined"
                  onClick={() => { setActiveTags([]); refresh({ tags: [] }); }}
                />
              )}
            </Stack>
          )}

          {["folder", "type"].includes(sortKey) ? (
            <Stack spacing={2}>
              {(sortKey === "folder" ? folderGroups : typeGroups).map(group => {
                const collapsed = collapsedGroups.has(group.id);
                return (
                  <Paper key={group.id} variant="outlined" sx={{ overflow: "hidden" }}>
                    <ButtonBase
                      onClick={() => toggleGroup(group.id)}
                      sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, textAlign: "left" }}
                    >
                      <Box>
                        <Typography variant="subtitle2">{group.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t("library:grid.groupItemCount", { count: group.items.length })}
                        </Typography>
                      </Box>
                      {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                    </ButtonBase>
                    {!collapsed && (
                      <Box sx={{ px: 2, pb: 2, overflowX: "auto" }}>
                        <Stack direction="row" spacing={2} sx={{ minHeight: 280 }}>
                          {group.items.map(it => (
                            <Box key={it.id} sx={{ minWidth: 260, maxWidth: 320 }}>
                              <PrintCard
                                item={it}
                                onSaveTags={onSaveTags}
                                onSaveDetails={onSaveDetails}
                                onRename={onRename}
                                onPreview={setPreviewItem}
                                onDownloadSingle={downloadPrint}
                                downloading={downloadingId === it.id}
                                onDelete={removePrint}
                                deleting={deletingId === it.id}
                                onMoveFolder={onMoveFolder}
                                folderOptions={folderOptions}
                                moving={movingId === it.id}
                                onDownloadByTag={downloadByTag}
                                onDownloadSelected={downloadSelected}
                                selected={selectedIds.has(it.id)}
                                onToggleSelected={() => toggleSelected(it.id)}
                                hasSelection={selectedIds.size > 0}
                                bulkDownloading={Boolean(bulkDownloading)}
                                slicerEnabled={slicerEnabled}
                                slicerLabel={slicerLabel}
                                onOpenInSlicer={openInSlicer}
                                engravingEnabled={engravingEnabled}
                                engraverLabel={engraverLabel}
                                onOpenInEngraving={openInEngraving}
                                theme={theme}
                                previewMode={previewSettings?.mode || "automatic"}
                                onPrintChanged={replacePrint}
                                onUnauthorized={onUnauthorized}
                              />
                            </Box>
                          ))}
                          {!group.items.length && (
                            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
                              {t("library:grid.groupEmpty")}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              }}
            >
              {sortedItems.map(it => (
                <PrintCard
                  key={it.id}
                  item={it}
                  onSaveTags={onSaveTags}
                  onSaveDetails={onSaveDetails}
                  onRename={onRename}
                  onPreview={setPreviewItem}
                  onDownloadSingle={downloadPrint}
                  downloading={downloadingId === it.id}
                  onDelete={removePrint}
                  deleting={deletingId === it.id}
                  onMoveFolder={onMoveFolder}
                  folderOptions={folderOptions}
                  moving={movingId === it.id}
                  onDownloadByTag={downloadByTag}
                  onDownloadSelected={downloadSelected}
                  selected={selectedIds.has(it.id)}
                  onToggleSelected={() => toggleSelected(it.id)}
                  hasSelection={selectedIds.size > 0}
                  bulkDownloading={Boolean(bulkDownloading)}
                  slicerEnabled={slicerEnabled}
                  slicerLabel={slicerLabel}
                  onOpenInSlicer={openInSlicer}
                  engravingEnabled={engravingEnabled}
                  engraverLabel={engraverLabel}
                  onOpenInEngraving={openInEngraving}
                  theme={theme}
                  previewMode={previewSettings?.mode || "automatic"}
                  onPrintChanged={replacePrint}
                  onUnauthorized={onUnauthorized}
                />
              ))}
            </Box>
          )}
          {hasMore && (
            <Stack direction="row" justifyContent="center" sx={{ pt: 1 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={loadMore}
                disabled={loadingMore}
                startIcon={loadingMore ? <CircularProgress size={14} /> : undefined}
              >
                {loadingMore ? t("library:grid.loadingMore") : t("library:grid.loadMore")}
              </Button>
            </Stack>
          )}
          {previewItem && (
            <PrintPreviewModal
              print={previewItem}
              theme={theme}
              slicerEnabled={slicerEnabled}
              slicerLabel={slicerLabel}
              slicerSelected={slicerSettings?.selected}
              engravingEnabled={engravingEnabled}
              engraverLabel={engraverLabel}
              engravingSelected={engravingSettings?.selected}
              onClose={() => setPreviewItem(null)}
              onPrintChanged={replacePrint}
              onUnauthorized={onUnauthorized}
            />
          )}
          {zipPrompt.modal}
          {importModePrompt.modal}
        </Stack>
      </Box>
  );
}

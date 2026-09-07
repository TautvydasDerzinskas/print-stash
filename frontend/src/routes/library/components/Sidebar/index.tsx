import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import EditIcon from "@mui/icons-material/Edit";
import SettingsIcon from "@mui/icons-material/Settings";
import LayersIcon from "@mui/icons-material/Layers";
import { Folder, UnauthorizedError, createFolder, deleteFolder, downloadFolderZip, listFolders, updateFolder, uploadPrints } from "../../../../services/api";
import { entriesFromDataTransfer, uploadEntriesToFolder } from "../../../../services/uploadTree";
import { buildUploadEntriesFromZip, isZipFile, readZipEntries } from "../../../../services/zipUtils";
import { useZipImportPrompt } from "../ZipImportModal";
import { useImportModePrompt, type ImportMode } from "../ImportModeModal";
import FolderTreeRow, { type FolderTreeContext } from "./components/FolderTreeRow";
import FolderActionMenu from "./components/FolderActionMenu";
import FolderEditorPanel, { type FolderOption } from "./components/FolderEditorPanel";

// Every dropped entry's relativePath equals its bare filename when the
// selection has no folder structure -- that's the signal for the
// separate-vs-multiplate prompt (a dropped folder always carries nested
// relativePaths and skips this prompt).
function isFlatFileSet(entries: { file: File; relativePath: string }[]) {
  return entries.length > 1 && entries.every(entry => entry.relativePath === entry.file.name);
}

type Props = {
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  onFoldersChanged?: () => void;
  foldersVersion?: number;
  onUnauthorized?: () => void;
  onOpenSettings?: () => void;
  activeView?: "library" | "settings";
  onAssetsChanged?: () => void;
};

const DROP_ALL_ID = "__all";

export default function Sidebar({
  selectedId,
  onSelect,
  onFoldersChanged,
  foldersVersion,
  onUnauthorized,
  onOpenSettings,
  activeView = "library",
  onAssetsChanged,
}: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editParent, setEditParent] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropUploading, setDropUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [menuState, setMenuState] = useState<{ folderId: string; anchorEl: HTMLElement } | null>(null);
  const zipPrompt = useZipImportPrompt();
  const importModePrompt = useImportModePrompt();

  const untitledLabel = t("sidebar.untitled");

  const uploadFlatAsMultiplate = async (files: File[], folderId: string | null) => {
    try {
      const result = await uploadPrints(files, { folder_id: folderId || undefined, mode: "multiplate" });
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
            ? t("sidebar.multiplateImportFailedWithMessage", { message })
            : t("sidebar.multiplateImportFailed"),
        ],
      };
    }
  };

  const uploadWithZipPrompt = async (entries: Awaited<ReturnType<typeof entriesFromDataTransfer>>, folderId: string | null) => {
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
              applyResult(await uploadFlatAsMultiplate(normalEntries.map(entry => entry.file), folderId));
            } else {
              applyResult(await uploadEntriesToFolder(normalEntries, folderId, onUnauthorized));
            }
          },
        });
      } else {
        const result = await uploadEntriesToFolder(normalEntries, folderId, onUnauthorized);
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
          const result = await uploadEntriesToFolder([entry], folderId, onUnauthorized);
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
          const result = await uploadEntriesToFolder(unzipEntries, folderId, onUnauthorized);
          applyResult(result);
        },
      });
    }
    if (uploaded) {
      onAssetsChanged?.();
    }
    if (failed.length) {
      alert(t("sidebar.errors.uploadFailed", { files: failed.join(", ") }));
    }
  };

  const isFileDrag = (e: React.DragEvent<HTMLElement>) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.includes("Files");
  };

  const handleDragOverTarget = (targetId: string) => (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dropUploading) {
      setDropTargetId(targetId);
    }
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDropFiles = (folderId: string | null) => async (
    e: React.DragEvent<HTMLElement>
  ) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropUploading) return;
    setDropTargetId(null);
    setDropUploading(true);
    const entries = await entriesFromDataTransfer(e.dataTransfer);
    if (!entries.length) {
      setDropUploading(false);
      return;
    }
    await uploadWithZipPrompt(entries, folderId);
    setDropUploading(false);
  };

  const handleSidebarDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
  };

  const handleSidebarDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    if (e.currentTarget !== e.target) return;
    e.preventDefault();
    setDropTargetId(null);
  };

  const handleSidebarDrop = (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropUploading) return;
    const targetFolderId =
      dropTargetId === DROP_ALL_ID ? null : dropTargetId;
    setDropTargetId(null);
    if (!targetFolderId && dropTargetId !== DROP_ALL_ID) return;
    setDropUploading(true);
    void (async () => {
      const entries = await entriesFromDataTransfer(e.dataTransfer);
      if (!entries.length) {
        setDropUploading(false);
        return;
      }
      await uploadWithZipPrompt(entries, targetFolderId);
      setDropUploading(false);
    })();
  };

  const filenameFromDisposition = (res: Response, fallback: string) => {
    const dispo = res.headers.get("content-disposition") || "";
    const match = dispo.match(/filename="?([^";]+)"?/i);
    return (match && match[1]) || fallback;
  };

  const saveResponseToDisk = async (res: Response, fallback: string) => {
    const filename = filenameFromDisposition(res, fallback);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleError = (err: unknown, message: string) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return;
    }
    console.error(err);
    alert(message);
  };

  const refresh = async () => {
    try {
      setFolders(await listFolders());
    } catch (err) {
      handleError(err, t("sidebar.errors.loadFolders"));
    }
  };
  useEffect(() => { refresh(); }, [foldersVersion]);

  const startCreate = (parentId: string | null = null) => {
    setEditing(null);
    setCreating(true);
    setNewName("");
    setNewParent(parentId ?? (selectedId || null));
  };
  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createFolder(newName.trim(), [], newParent || undefined);
      await refresh();
      if (newParent) {
        setExpanded(prev => new Set(prev).add(newParent));
      }
      onFoldersChanged?.();
    } catch (err) {
      handleError(err, t("sidebar.errors.createFolder"));
    } finally { setBusy(false); setCreating(false); }
  };

  const startEdit = (f: Folder) => {
    setCreating(false);
    setEditing(f.id);
    setEditName(f.name);
    setEditTags(f.tags);
    setEditParent(f.parent_id || null);
  };
  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateFolder(editing, editName.trim() || untitledLabel, editTags, editParent || undefined);
      await refresh();
      onFoldersChanged?.();
    } catch (err) {
      handleError(err, t("sidebar.errors.updateFolder"));
    } finally { setBusy(false); setEditing(null); setEditTags([]); setEditParent(null); }
  };

  const remove = async (id: string) => {
    if (!confirm(t("sidebar.confirmDeleteFolder"))) return;
    setBusy(true);
    try {
      await deleteFolder(id);
      await refresh();
      onFoldersChanged?.();
      if (selectedId === id) onSelect(null);
    }
    catch (err) {
      handleError(err, t("sidebar.errors.deleteFolder"));
    }
    finally { setBusy(false); }
  };

  const downloadFolder = async (folder: Folder) => {
    setBusy(true);
    try {
      const res = await downloadFolderZip(folder.id);
      const safe = (folder.name || "folder").replace(/\s+/g, "_") || "folder";
      await saveResponseToDisk(res, `${safe}.zip`);
    } catch (err) {
      handleError(err, t("sidebar.errors.downloadFolder"));
    } finally {
      setBusy(false);
    }
  };

  const folderById = React.useMemo(() => {
    const map: Record<string, Folder> = {};
    folders.forEach(f => { map[f.id] = f; });
    return map;
  }, [folders]);

  useEffect(() => {
    // Ensure selected folder path is expanded
    if (!selectedId) return;
    const next = new Set(expanded);
    let current = folderById[selectedId];
    const guard = new Set<string>();
    while (current?.parent_id && !guard.has(current.parent_id)) {
      next.add(current.parent_id);
      guard.add(current.parent_id);
      current = folderById[current.parent_id];
    }
    setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, folderById]);

  const isDescendant = React.useCallback(
    (candidateId: string, targetId: string) => {
      let current = folderById[candidateId];
      const guard = new Set<string>();
      while (current) {
        if (!current.parent_id) return false;
        if (current.parent_id === targetId) return true;
        if (guard.has(current.parent_id)) break;
        guard.add(current.parent_id);
        current = folderById[current.parent_id];
      }
      return false;
    },
    [folderById]
  );

  const folderPath = React.useCallback(
    (folder: Folder) => {
      const segments = [folder.name || untitledLabel];
      let current = folder;
      const guard = new Set<string>([folder.id]);
      while (current.parent_id) {
        const parent = folderById[current.parent_id];
        if (!parent || guard.has(parent.id)) break;
        segments.unshift(parent.name || untitledLabel);
        guard.add(parent.id);
        current = parent;
      }
      return segments.join(" / ");
    },
    [folderById, untitledLabel]
  );

  const folderOptions: FolderOption[] = React.useMemo(() => {
    const opts: FolderOption[] = [{ id: null, name: t("sidebar.rootOption") }];
    const sorted = [...folders].sort((a, b) => folderPath(a).localeCompare(folderPath(b)));
    sorted.forEach(f => opts.push({ id: f.id, name: folderPath(f) }));
    return opts;
  }, [folders, folderPath, t]);

  const childrenMap = React.useMemo(() => {
    const map: Record<string, Folder[]> = {};
    const push = (key: string, f: Folder) => {
      if (!map[key]) map[key] = [];
      map[key].push(f);
    };
    folders.forEach(f => push(f.parent_id || "__root", f));
    Object.values(map).forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [folders]);

  const visibleFolderIds = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return null;

    const visible = new Set<string>();
    folders.forEach(folder => {
      if (!folderPath(folder).toLocaleLowerCase().includes(normalizedQuery)) return;
      let current: Folder | undefined = folder;
      const guard = new Set<string>();
      while (current && !guard.has(current.id)) {
        visible.add(current.id);
        guard.add(current.id);
        current = current.parent_id ? folderById[current.parent_id] : undefined;
      }
    });
    return visible;
  }, [folderById, folderPath, folders, query]);

  // Default-expand root folders so they are visible
  useEffect(() => {
    const roots = childrenMap["__root"] || [];
    if (!roots.length) return;
    setExpanded(prev => {
      const next = new Set(prev);
      roots.forEach(r => next.add(r.id));
      return next;
    });
  }, [childrenMap]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeMenuFolder = menuState ? folderById[menuState.folderId] ?? null : null;

  const treeCtx: FolderTreeContext = {
    childrenMap,
    visibleFolderIds,
    expanded,
    dropTargetId,
    selectedId,
    query,
    untitledLabel,
    collapseLabel: t("sidebar.collapse"),
    expandLabel: t("sidebar.expand"),
    actionsForLabel: name => t("sidebar.actionsFor", { name }),
    folderPath,
    onSelect: id => onSelect(id),
    onToggleExpand: toggleExpand,
    onDragOverTarget: handleDragOverTarget,
    onDropFiles: handleDropFiles,
    onOpenMenu: (folderId, anchorEl) => setMenuState({ folderId, anchorEl }),
  };

  const editFolderOptions = React.useMemo(
    () =>
      folderOptions.filter(
        opt => !editing || (opt.id !== editing && !(opt.id && isDescendant(opt.id, editing)))
      ),
    [folderOptions, editing, isDescendant]
  );

  return (
    <Box
      component="aside"
      onDragOver={handleSidebarDragOver}
      onDragLeave={handleSidebarDragLeave}
      onDrop={handleSidebarDrop}
      sx={{
        width: 280,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("sidebar.brand")}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6" noWrap>{t("sidebar.libraryTitle")}</Typography>
            <Chip size="small" label={folders.length} title={t("sidebar.folderCountTitle", { count: folders.length }) ?? undefined} />
          </Stack>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon fontSize="small" />}
          onClick={() => startCreate(null)}
          title={t("sidebar.newFolderTitle") ?? undefined}
        >
          {t("sidebar.newFolder")}
        </Button>
      </Stack>

      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          fullWidth
          size="small"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t("sidebar.searchPlaceholder") ?? undefined}
          inputProps={{ "aria-label": t("sidebar.searchAriaLabel") ?? undefined }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => setQuery("")}
                  aria-label={t("sidebar.clearSearchAria") ?? undefined}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
      </Box>

      <Box component="nav" aria-label={t("sidebar.foldersHeading") ?? undefined} sx={{ flex: 1, overflow: "auto", px: 1 }}>
        <List disablePadding>
          <ListItemButton
            selected={!selectedId}
            onClick={() => onSelect(null)}
            onDragOver={handleDragOverTarget(DROP_ALL_ID)}
            onDrop={handleDropFiles(null)}
            sx={{
              borderRadius: 1,
              mb: 0.5,
              ...(dropTargetId === DROP_ALL_ID && {
                outline: "2px dashed",
                outlineColor: "primary.main",
                outlineOffset: -2,
              }),
            }}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>
              <LayersIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t("sidebar.allFiles")} primaryTypographyProps={{ variant: "body2" }} />
            <Chip size="small" variant="outlined" label={t("sidebar.root")} />
          </ListItemButton>
        </List>

        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, py: 0.75 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("sidebar.foldersHeading")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {visibleFolderIds ? visibleFolderIds.size : folders.length}
          </Typography>
        </Stack>

        <List disablePadding>
          {(childrenMap["__root"] || []).map(f => (
            <FolderTreeRow key={f.id} folder={f} depth={0} ctx={treeCtx} />
          ))}
        </List>
        {folders.length === 0 && (
          <Stack alignItems="center" spacing={1} sx={{ py: 4, color: "text.secondary" }}>
            <CreateNewFolderIcon />
            <Typography variant="body2">{t("sidebar.noFoldersYet")}</Typography>
            <Button size="small" onClick={() => startCreate(null)}>{t("sidebar.createFirstFolder")}</Button>
          </Stack>
        )}
        {!!folders.length && visibleFolderIds?.size === 0 && (
          <Stack alignItems="center" spacing={1} sx={{ py: 4, color: "text.secondary" }}>
            <SearchIcon />
            <Typography variant="body2">{t("sidebar.noMatchingFolders")}</Typography>
            <Button size="small" onClick={() => setQuery("")}>{t("sidebar.clearSearch")}</Button>
          </Stack>
        )}
      </Box>

      <FolderActionMenu
        folder={activeMenuFolder}
        anchorEl={menuState?.anchorEl ?? null}
        busy={busy}
        labels={{
          subfolder: t("sidebar.subfolder"),
          renameEdit: t("sidebar.renameEdit"),
          downloadZip: t("sidebar.downloadZip"),
          delete: t("sidebar.delete"),
        }}
        onClose={() => setMenuState(null)}
        onSubfolder={folder => startCreate(folder.id)}
        onRename={startEdit}
        onDownload={downloadFolder}
        onDelete={folder => remove(folder.id)}
      />

      {creating && (
        <FolderEditorPanel
          mode="create"
          icon={<CreateNewFolderIcon fontSize="small" />}
          title={t("sidebar.createFolderTitle")}
          subtitle={t("sidebar.createFolderSubtitle")}
          name={newName}
          onNameChange={setNewName}
          namePlaceholder={t("sidebar.folderNamePlaceholder") ?? undefined}
          parentId={newParent}
          onParentChange={setNewParent}
          folderOptions={folderOptions}
          busy={busy}
          submitLabel={t("sidebar.create")}
          submitDisabled={!newName.trim()}
          onSubmit={create}
          onCancel={() => { setCreating(false); setNewParent(null); }}
        />
      )}

      {editing && (
        <FolderEditorPanel
          mode="edit"
          icon={<EditIcon fontSize="small" />}
          title={t("sidebar.editFolderTitle")}
          subtitle={t("sidebar.editFolderSubtitle")}
          name={editName}
          onNameChange={setEditName}
          parentId={editParent}
          onParentChange={setEditParent}
          folderOptions={editFolderOptions}
          tags={editTags}
          onTagsChange={setEditTags}
          tagsPlaceholder={t("sidebar.addFolderTagsPlaceholder") ?? undefined}
          busy={busy}
          submitLabel={t("sidebar.saveChanges")}
          onSubmit={saveEdit}
          onCancel={() => { setEditing(null); setEditTags([]); setEditParent(null); }}
        />
      )}

      <Box sx={{ borderTop: "1px solid", borderColor: "divider", p: 1 }}>
        <ListItemButton
          selected={activeView === "settings"}
          onClick={onOpenSettings}
          aria-label={t("common:settings") ?? undefined}
          sx={{ borderRadius: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 30 }}>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("common:settings")} primaryTypographyProps={{ variant: "body2" }} />
        </ListItemButton>
      </Box>
      {zipPrompt.modal}
      {importModePrompt.modal}
    </Box>
  );
}

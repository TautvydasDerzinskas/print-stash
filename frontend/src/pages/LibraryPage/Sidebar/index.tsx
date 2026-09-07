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
import Divider from "@mui/material/Divider";
import Collapse from "@mui/material/Collapse";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import EditIcon from "@mui/icons-material/Edit";
import LayersIcon from "@mui/icons-material/Layers";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SettingsIcon from "@mui/icons-material/Settings";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { UnauthorizedError } from "../../../api/client";
import { type Folder, foldersApi } from "../../../api/folders";
import { printsApi } from "../../../api/prints";
import { entriesFromDataTransfer, uploadEntriesToFolder } from "../../../utils/uploadTree";
import { buildUploadEntriesFromZip, isZipFile, readZipEntries } from "../../../utils/zipUtils";
import { useZipImportPrompt } from "../ZipImportModal";
import { useImportModePrompt, type ImportMode } from "../ImportModeModal";
import FolderTreeRow, { type FolderTreeContext } from "./FolderTreeRow";
import FolderActionMenu from "./FolderActionMenu";
import FolderEditorPanel, { type FolderOption } from "./FolderEditorPanel";
import { isFileDrag } from "../../../utils/dragEvents";
import { saveResponseToDisk } from "../../../utils/downloadResponse";
import Wordmark from "../../../components/Wordmark";
import { useConfirm } from "../../../components/ConfirmProvider";
import type { ActiveView } from "../../../constants/views";

// Every dropped entry's relativePath equals its bare filename when the
// selection has no folder structure -- that's the signal for the
// separate-vs-multiplate prompt (a dropped folder always carries nested
// relativePaths and skips this prompt).
function isFlatFileSet(entries: { file: File; relativePath: string }[]) {
  return entries.length > 1 && entries.every(entry => entry.relativePath === entry.file.name);
}

function handleSidebarDragOver(e: React.DragEvent<HTMLElement>) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
}

const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "printstash_sidebar_collapsed";

/** Icon-only rail row used for every top-level nav item (Dashboard, All files, Administration)
 *  once the sidebar is collapsed -- a tooltip stands in for the label. */
function CollapsedNavIcon({ icon, label, selected, onClick }: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={label} placement="right">
      <ListItemButton
        selected={selected}
        onClick={onClick}
        sx={{ borderRadius: 1, mb: 0.5, justifyContent: "center", px: 0 }}
      >
        <ListItemIcon sx={{ minWidth: 0, color: selected ? "primary.main" : "text.secondary" }}>
          {icon}
        </ListItemIcon>
      </ListItemButton>
    </Tooltip>
  );
}

type Props = {
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  onFoldersChanged?: () => void;
  foldersVersion?: number;
  onUnauthorized?: () => void;
  onAssetsChanged?: () => void;
  activeView: ActiveView;
  isAdmin: boolean;
  onOpenDashboard: () => void;
  onOpenAdminSettings: () => void;
};

const DROP_ALL_ID = "__all";

export default function Sidebar({
  selectedId,
  onSelect,
  onFoldersChanged,
  foldersVersion,
  onUnauthorized,
  onAssetsChanged,
  activeView,
  isAdmin,
  onOpenDashboard,
  onOpenAdminSettings,
}: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });
  const [adminExpanded, setAdminExpanded] = useState(false);
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
  const confirmDialog = useConfirm();

  const untitledLabel = t("sidebar.untitled");
  const adminOpen = adminExpanded || activeView === "adminSettings";

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const uploadFlatAsMultiplate = async (files: File[], folderId: string | null) => {
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
      setFolders(await foldersApi.list());
    } catch (err) {
      handleError(err, t("sidebar.errors.loadFolders"));
    }
  };
  // Intentionally re-run only when foldersVersion changes, not on every re-render of `refresh`.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
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
      await foldersApi.create(newName.trim(), [], newParent || undefined);
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
      await foldersApi.update(editing, editName.trim() || untitledLabel, editTags, editParent || undefined);
      await refresh();
      onFoldersChanged?.();
    } catch (err) {
      handleError(err, t("sidebar.errors.updateFolder"));
    } finally { setBusy(false); setEditing(null); setEditTags([]); setEditParent(null); }
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog({ message: t("sidebar.confirmDeleteFolder"), destructive: true }))) return;
    setBusy(true);
    try {
      await foldersApi.delete(id);
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
      const res = await foldersApi.downloadZip(folder.id);
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
    const sorted = folders.toSorted((a, b) => folderPath(a).localeCompare(folderPath(b)));
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
    // Sorting in place is fine here: `map`'s arrays were just built by `push` a few lines above
    // and are owned exclusively by this memo, so there's nothing else to observe the mutation.
    // oxlint-disable-next-line unicorn/no-array-sort
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

  const currentWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const allFilesSelected = activeView === "library" && !selectedId;

  return (
    <Box
      component="aside"
      onDragOver={handleSidebarDragOver}
      onDragLeave={handleSidebarDragLeave}
      onDrop={handleSidebarDrop}
      sx={{
        width: currentWidth,
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
        transition: (theme) => theme.transitions.create("width", { duration: theme.transitions.duration.shortest }),
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent={collapsed ? "center" : "space-between"}
        sx={{ px: collapsed ? 1 : 2, pt: 2, pb: 1.5 }}
      >
        {!collapsed && <Wordmark size="sm" />}
        <Tooltip title={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}>
          <IconButton size="small" onClick={toggleCollapsed}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      <List disablePadding sx={{ px: collapsed ? 0.5 : 1 }}>
        {collapsed ? (
          <CollapsedNavIcon
            icon={<SpaceDashboardIcon fontSize="small" />}
            label={t("sidebar.dashboard")}
            selected={activeView === "dashboard"}
            onClick={onOpenDashboard}
          />
        ) : (
          <ListItemButton
            selected={activeView === "dashboard"}
            onClick={onOpenDashboard}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>
              <SpaceDashboardIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t("sidebar.dashboard")} primaryTypographyProps={{ variant: "body2" }} />
          </ListItemButton>
        )}
      </List>

      <Box
        component="nav"
        aria-label={t("sidebar.foldersHeading") ?? undefined}
        sx={{ flex: 1, overflow: "auto", px: collapsed ? 0.5 : 1 }}
      >
        {!collapsed && (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, pt: 1, pb: 1 }}>
              <Typography variant="h6" noWrap>
                {t("sidebar.foldersHeadingWithCount", { count: visibleFolderIds ? visibleFolderIds.size : folders.length })}
              </Typography>
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

            <Box sx={{ px: 1, pb: 1 }}>
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

            <Divider sx={{ my: 1 }} />
          </>
        )}

        <List disablePadding>
          {collapsed ? (
            <CollapsedNavIcon
              icon={<LayersIcon fontSize="small" />}
              label={t("sidebar.allFiles")}
              selected={allFilesSelected}
              onClick={() => onSelect(null)}
            />
          ) : (
            <ListItemButton
              selected={allFilesSelected}
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
          )}

          {isAdmin && (
            collapsed ? (
              <CollapsedNavIcon
                icon={<AdminPanelSettingsIcon fontSize="small" />}
                label={t("sidebar.administration")}
                selected={activeView === "adminSettings"}
                onClick={onOpenAdminSettings}
              />
            ) : (
              <>
                <ListItemButton
                  selected={false}
                  onClick={() => setAdminExpanded(v => !v)}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 30 }}>
                    <AdminPanelSettingsIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={t("sidebar.administration")} primaryTypographyProps={{ variant: "body2" }} />
                  {adminOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </ListItemButton>
                <Collapse in={adminOpen}>
                  <List disablePadding>
                    <ListItemButton
                      selected={activeView === "adminSettings"}
                      onClick={onOpenAdminSettings}
                      sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                    >
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <SettingsIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={t("common:settings")} primaryTypographyProps={{ variant: "body2" }} />
                    </ListItemButton>
                  </List>
                </Collapse>
              </>
            )
          )}
        </List>
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

      {zipPrompt.modal}
      {importModePrompt.modal}
    </Box>
  );
}

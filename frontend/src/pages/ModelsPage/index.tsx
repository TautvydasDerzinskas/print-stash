import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { UnauthorizedError } from "../../api/client";
import { type Print, type PrintSortMode, printsApi } from "../../api/prints";
import { type Folder, type FolderMetaInput, foldersApi } from "../../api/folders";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import CategoriesPanel from "./CategoriesPanel";
import CategoryBanner from "./CategoryBanner";
import ModelCard from "./ModelCard";
import SortTabs from "./SortTabs";

const PAGE_SIZE = 24;

type Props = {
  folderId: string | null;
  onSelectFolder: (id: string | null) => void;
  foldersVersion: number;
  onFoldersChanged: () => void;
  /** Bumped whenever prints change elsewhere (e.g. the top bar's upload/import) so the grid
   *  refetches without needing a full remount -- keeps this page's own state (like the category
   *  manager modal) intact across those refreshes. */
  printsVersion: number;
  onUnauthorized?: () => void;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
};

export default function ModelsPage({ folderId, onSelectFolder, foldersVersion, onFoldersChanged, printsVersion, onUnauthorized, theme, previewMode }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [items, setItems] = useState<Print[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const sortModeParam = searchParams.get("orderBy");
  const sortMode: PrintSortMode = sortModeParam === "popular" || sortModeParam === "downloads" ? sortModeParam : "newest";

  const setSortMode = (mode: PrintSortMode) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (mode === "newest") next.delete("orderBy");
      else next.set("orderBy", mode);
      return next;
    });
  };

  // A root category has no models of its own directly in the tree UI, so selecting one should
  // pull in every model filed under any of its subcategories (plus the root itself, since prints
  // can technically still be filed directly on it).
  const folderIdFilter = useMemo(() => {
    if (!folderId) return undefined;
    const isRoot = folders.some(f => f.id === folderId && !f.parent_id);
    if (!isRoot) return folderId;
    const childIds = folders.filter(f => f.parent_id === folderId).map(f => f.id);
    return [folderId, ...childIds];
  }, [folderId, folders]);

  // Plain "Models" (and the route's default back-to-Dashboard) while nothing's selected; once a
  // category is active, the title reflects it and back instead clears the filter -- "back to
  // all" one level at a time, matching the sidebar's own initial-vs-filtered framing.
  const selectedFolder = folderId ? folders.find(f => f.id === folderId) ?? null : null;
  usePageHeader({
    title: selectedFolder ? `${t("models:pageTitle")} - ${selectedFolder.name || t("models:categories.untitled")}` : undefined,
    onBack: folderId ? () => onSelectFolder(null) : undefined,
  });

  const handleError = (err: unknown, message?: string) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return true;
    }
    console.error(err);
    if (message) alert(message);
    return false;
  };

  useEffect(() => {
    setFoldersLoading(true);
    (async () => {
      try {
        setFolders(await foldersApi.list());
      } catch (err) {
        handleError(err, t("models:errors.loadCategoriesFailed"));
      } finally {
        setFoldersLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersVersion]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const result = await printsApi.list({ folder_id: folderIdFilter, order_by: sortMode, limit: PAGE_SIZE, offset: 0 });
        setItems(result.items);
        setOffset(result.items.length);
        setHasMore(result.hasMore);
      } catch (err) {
        handleError(err, t("models:errors.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIdFilter, printsVersion, sortMode]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await printsApi.list({ folder_id: folderIdFilter, order_by: sortMode, limit: PAGE_SIZE, offset });
      setItems(prev => [...prev, ...result.items]);
      setOffset(offset + result.items.length);
      setHasMore(result.hasMore);
    } catch (err) {
      handleError(err, t("models:errors.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreSentinelRef = useInfiniteScroll(loadMore, hasMore, loading || loadingMore);

  const createCategory = async (name: string, parentId: string | null) => {
    try {
      await foldersApi.create(name, [], parentId || undefined);
      onFoldersChanged();
    } catch (err) {
      handleError(err, t("models:errors.createCategoryFailed"));
    }
  };

  const renameCategory = async (id: string, name: string) => {
    const existing = folders.find(f => f.id === id);
    try {
      await foldersApi.update(id, name, existing?.tags || [], existing?.parent_id || undefined);
      onFoldersChanged();
    } catch (err) {
      handleError(err, t("models:errors.renameCategoryFailed"));
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await foldersApi.delete(id);
      onFoldersChanged();
      if (folderId === id) onSelectFolder(null);
    } catch (err) {
      handleError(err, t("models:errors.deleteCategoryFailed"));
    }
  };

  const reorderCategories = async (folderIds: string[]) => {
    try {
      await foldersApi.reorder(folderIds);
      onFoldersChanged();
    } catch (err) {
      handleError(err, t("models:errors.reorderCategoryFailed"));
    }
  };

  const updateCategoryMeta = async (id: string, meta: FolderMetaInput) => {
    try {
      await foldersApi.updateMeta(id, meta);
      onFoldersChanged();
    } catch (err) {
      // Unlike the other handlers here, this one rethrows anything but the auth-redirect case:
      // CategoryMetaDialog shows the specific message (e.g. a bad category-id string naming the
      // exact typo) inline and keeps the dialog open with the user's edits intact, instead of a
      // generic alert() that closes the dialog and discards what they typed either way.
      if (handleError(err)) return;
      throw err;
    }
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <SortTabs value={sortMode} onChange={setSortMode} />
      </Box>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <CategoriesPanel
          folders={folders}
          loading={foldersLoading}
          selectedId={folderId}
          onSelect={onSelectFolder}
          onCreate={createCategory}
          onRename={renameCategory}
          onDelete={deleteCategory}
          onReorder={reorderCategories}
          onUpdateMeta={updateCategoryMeta}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {selectedFolder?.meta_title && (
            <Box sx={{ mb: 2 }}>
              <CategoryBanner folder={selectedFolder} />
            </Box>
          )}
          {loading ? (
            <Stack alignItems="center" sx={{ py: 8 }}>
              <CircularProgress size={22} />
            </Stack>
          ) : items.length ? (
            <Stack spacing={2}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", columnGap: "20px", rowGap: "20px" }}>
                {items.map(item => (
                  <ModelCard
                    key={item.id}
                    item={item}
                    theme={theme}
                    previewMode={previewMode}
                    onDeleted={deletedId => setItems(prev => prev.filter(i => i.id !== deletedId))}
                    onFavoriteChange={updated => setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))}
                    onUnauthorized={onUnauthorized}
                  />
                ))}
              </Box>
              {hasMore && (
                <Stack ref={loadMoreSentinelRef} direction="row" justifyContent="center" sx={{ py: 1 }}>
                  {loadingMore && (
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
                      <CircularProgress size={14} />
                      <Typography variant="caption">{t("models:grid.loadingMore")}</Typography>
                    </Stack>
                  )}
                </Stack>
              )}
            </Stack>
          ) : (
            <Stack alignItems="center" spacing={1} sx={{ py: 8, color: "text.secondary" }}>
              <Typography variant="body2">{t("models:grid.empty")}</Typography>
            </Stack>
          )}
        </Box>
      </Stack>
    </Stack>
  );
}

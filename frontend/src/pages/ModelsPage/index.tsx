import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { UnauthorizedError } from "../../api/client";
import { type Print, printsApi } from "../../api/prints";
import { type Folder, foldersApi } from "../../api/folders";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import CategoriesPanel from "./CategoriesPanel";
import ModelCard from "./ModelCard";

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
        const result = await printsApi.list({ folder_id: folderId || undefined, limit: PAGE_SIZE, offset: 0 });
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
  }, [folderId, printsVersion]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await printsApi.list({ folder_id: folderId || undefined, limit: PAGE_SIZE, offset });
      setItems(prev => [...prev, ...result.items]);
      setOffset(offset + result.items.length);
      setHasMore(result.hasMore);
    } catch (err) {
      handleError(err, t("models:errors.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

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

  return (
    <Stack direction="row" spacing={2} alignItems="flex-start">
      <CategoriesPanel
        folders={folders}
        loading={foldersLoading}
        selectedId={folderId}
        onSelect={onSelectFolder}
        onCreate={createCategory}
        onRename={renameCategory}
        onDelete={deleteCategory}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 8 }}>
            <CircularProgress size={22} />
          </Stack>
        ) : items.length ? (
          <Stack spacing={2}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
              {items.map(item => (
                <ModelCard key={item.id} item={item} theme={theme} previewMode={previewMode} />
              ))}
            </Box>
            {hasMore && (
              <Stack direction="row" justifyContent="center">
                <Button
                  variant="outlined"
                  size="small"
                  onClick={loadMore}
                  disabled={loadingMore}
                  startIcon={loadingMore ? <CircularProgress size={14} /> : undefined}
                >
                  {loadingMore ? t("models:grid.loadingMore") : t("models:grid.loadMore")}
                </Button>
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
  );
}

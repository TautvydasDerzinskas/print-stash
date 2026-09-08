import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { UnauthorizedError } from "../../api/client";
import { type Collection, collectionsApi } from "../../api/collections";
import { type Print, printsApi } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { collectionDisplayName } from "../../utils/collectionDisplay";
import ModelCard from "../ModelsPage/ModelCard";
import CollectionActionsMenu from "./CollectionActionsMenu";

const PAGE_SIZE = 24;

type Props = {
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  onUnauthorized?: () => void;
};

export default function CollectionDetailPage({ theme, previewMode, onUnauthorized }: Props) {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(["models", "common"]);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [items, setItems] = useState<Print[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const goBack = () => navigate("/models/collections");

  usePageHeader({
    title: collection ? collectionDisplayName(collection, t) : undefined,
    actions: collection && !collection.system_key ? (
      <CollectionActionsMenu
        collection={collection}
        onUpdated={setCollection}
        onUnauthorized={onUnauthorized}
        onDeleted={goBack}
      />
    ) : undefined,
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
    if (!collectionId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const [collectionResult, printsResult] = await Promise.all([
          collectionsApi.get(collectionId),
          printsApi.list({ collection_id: collectionId, limit: PAGE_SIZE, offset: 0 }),
        ]);
        if (cancelled) return;
        setCollection(collectionResult);
        setItems(printsResult.items);
        setOffset(printsResult.items.length);
        setHasMore(printsResult.hasMore);
      } catch (err) {
        if (cancelled) return;
        if (handleError(err)) return;
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !collectionId) return;
    setLoadingMore(true);
    try {
      const result = await printsApi.list({ collection_id: collectionId, limit: PAGE_SIZE, offset });
      setItems(prev => [...prev, ...result.items]);
      setOffset(offset + result.items.length);
      setHasMore(result.hasMore);
    } catch (err) {
      handleError(err, t("models:errors.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress size={22} />
      </Stack>
    );
  }

  if (notFound || !collection) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 8, color: "text.secondary" }}>
        <Typography variant="body2">{t("models:collections.errors.notFound")}</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {collection.description && (
        <Typography variant="body2" color="text.secondary">{collection.description}</Typography>
      )}
      {items.length ? (
        <Stack spacing={2}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", columnGap: "20px", rowGap: "20px" }}>
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
          <Typography variant="body2">{t("models:collections.detail.empty")}</Typography>
        </Stack>
      )}
    </Stack>
  );
}

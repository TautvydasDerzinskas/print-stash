import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import { UnauthorizedError } from "../../api/client";
import { collectionsApi, type CollectionMembership } from "../../api/collections";

type Props = {
  open: boolean;
  onClose: () => void;
  printId: string;
  onUnauthorized?: () => void;
  /** The collection currently being browsed, if any -- toggling it off here also fires
   *  onRemovedFromCollection so the card can drop out of that grid immediately, mirroring
   *  ModelActionsMenu's dedicated "Remove from collection" item. */
  collectionId?: string;
  onRemovedFromCollection?: () => void;
};

/** Tag-style picker for a model's collection membership: every real (non-system) collection the
 *  user owns as a clickable chip, filled when the model is already in it. Each click toggles that
 *  one collection immediately (no separate save step), matching how TagInput-adjacent pickers
 *  behave elsewhere in the app. Opened from ModelActionsMenu's "Add to collection" item, shared by
 *  the model detail page's title menu and every models grid's per-card "..." menu. */
export default function AddToCollectionModal({
  open,
  onClose,
  printId,
  onUnauthorized,
  collectionId,
  onRemovedFromCollection,
}: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [collections, setCollections] = useState<CollectionMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCollections(null);
    collectionsApi
      .listForPrint(printId)
      .then(setCollections)
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          onUnauthorized?.();
          return;
        }
        setError(err instanceof Error ? err.message : t("models:detail.addToCollectionLoadFailed"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, printId]);

  const toggle = async (collection: CollectionMembership) => {
    if (pendingId) return;
    const nextIn = !collection.in_collection;
    setPendingId(collection.id);
    setError(null);
    try {
      if (nextIn) {
        await collectionsApi.addItem(collection.id, printId);
      } else {
        await collectionsApi.removeItem(collection.id, printId);
      }
      setCollections((prev) => prev?.map((c) => (c.id === collection.id ? { ...c, in_collection: nextIn } : c)) ?? prev);
      if (collection.id === collectionId && !nextIn) onRemovedFromCollection?.();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      setError(err instanceof Error ? err.message : t("models:detail.addToCollectionFailed"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("models:detail.addToCollectionTitle")}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        {collections === null && !error && (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={24} />
          </Stack>
        )}
        {collections?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t("models:detail.addToCollectionEmpty")}
          </Typography>
        )}
        {collections && collections.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {collections.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                clickable
                disabled={pendingId === c.id}
                onClick={() => toggle(c)}
                color={c.in_collection ? "primary" : "default"}
                variant={c.in_collection ? "filled" : "outlined"}
                icon={
                  pendingId === c.id ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : c.in_collection ? (
                    <CheckIcon fontSize="small" />
                  ) : undefined
                }
              />
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common:close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

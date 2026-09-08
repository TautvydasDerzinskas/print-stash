import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import AddIcon from "@mui/icons-material/Add";
import { UnauthorizedError } from "../../api/client";
import { type Collection, type CollectionInput, collectionsApi } from "../../api/collections";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import CollectionCard from "./CollectionCard";
import CollectionFormModal from "./CollectionFormModal";

type Props = {
  onUnauthorized?: () => void;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
};

export default function CollectionsPage({ onUnauthorized, theme, previewMode }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const handleError = (err: unknown, message?: string) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return true;
    }
    console.error(err);
    if (message) alert(message);
    return false;
  };

  const load = async () => {
    setLoading(true);
    try {
      setCollections(await collectionsApi.list());
    } catch (err) {
      handleError(err, t("models:collections.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createCollection = async (input: CollectionInput) => {
    await collectionsApi.create(input);
    await load();
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon fontSize="small" />}
          onClick={() => setFormOpen(true)}
        >
          {t("models:collections.newCollection")}
        </Button>
      </Stack>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={22} />
        </Stack>
      ) : collections.length ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: "20px", rowGap: "20px" }}>
          {collections.map(collection => (
            <CollectionCard key={collection.id} collection={collection} theme={theme} previewMode={previewMode} />
          ))}
        </Box>
      ) : (
        <Stack alignItems="center" spacing={1} sx={{ py: 8, color: "text.secondary" }}>
          <Typography variant="body2">{t("models:collections.empty")}</Typography>
        </Stack>
      )}

      {formOpen && (
        <CollectionFormModal onClose={() => setFormOpen(false)} onSubmit={createCollection} />
      )}
    </Stack>
  );
}

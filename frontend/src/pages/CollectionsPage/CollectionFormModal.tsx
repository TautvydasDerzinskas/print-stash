import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import type { Collection, CollectionInput } from "../../api/collections";
import TagInput from "../../components/TagInput";

type Props = {
  collection?: Collection | null;
  onClose: () => void;
  onSubmit: (input: CollectionInput) => Promise<void>;
};

/** Shared create/edit dialog for a Collection -- name, description, tags. Edit mode is just
 *  create mode prefilled from `collection`, per the spec ("Edit brings the creation modal"). */
export default function CollectionFormModal({ collection, onClose, onSubmit }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [name, setName] = useState(collection?.name || "");
  const [description, setDescription] = useState(collection?.description || "");
  const [tags, setTags] = useState<string[]>(collection?.tags || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(collection);
  const trimmedName = name.trim();

  const handleSubmit = async () => {
    if (!trimmedName || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: trimmedName, description: description.trim() || null, tags });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("models:collections.form.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {isEdit ? t("models:collections.form.editTitle") : t("models:collections.form.createTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t("models:collections.form.nameLabel")}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saving}
            fullWidth
            // Deliberate: focus the name field the moment the dialog opens.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            required
          />
          <TextField
            label={t("models:collections.form.descriptionLabel")}
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={saving}
            fullWidth
            multiline
            minRows={3}
          />
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              {t("models:collections.form.tagsLabel")}
            </Typography>
            <TagInput value={tags} onChange={setTags} placeholder={t("models:collections.form.tagsPlaceholder") ?? undefined} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t("common:cancel")}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !trimmedName}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isEdit ? t("common:save") : t("models:collections.form.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

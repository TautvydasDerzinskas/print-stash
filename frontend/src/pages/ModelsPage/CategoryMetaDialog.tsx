import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import type { Folder, FolderMetaInput } from "../../api/folders";

type Props = {
  folder: Folder;
  onClose: () => void;
  onSave: (meta: FolderMetaInput) => Promise<void>;
};

/** Parses a category-id field: blank stays null, anything else must be a positive integer (kept
 *  as free text while typing so "12" isn't clobbered mid-edit; validated only on save). */
function parseCatId(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Meta title/description/site-category-id editor for one category, opened from its "details"
 *  icon in the manager. Saving with all fields blank clears the category's metadata entirely.
 *  The three `*CatId` fields drive auto-categorization on import (see importService.ts's
 *  resolveFolderIdByCategory on the backend): when an imported model's own site category id
 *  matches one set here, it lands in this category automatically. */
export default function CategoryMetaDialog({ folder, onClose, onSave }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const untitledLabel = t("models:categories.untitled");
  const [title, setTitle] = useState(folder.meta_title ?? "");
  const [description, setDescription] = useState(folder.meta_description ?? "");
  const [makerworldCatId, setMakerworldCatId] = useState(folder.makerworld_cat_id?.toString() ?? "");
  const [thingiverseCatId, setThingiverseCatId] = useState(folder.thingiverse_cat_id?.toString() ?? "");
  const [printablesCatId, setPrintablesCatId] = useState(folder.printables_cat_id?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        metaTitle: title.trim() || null,
        metaDescription: description.trim() || null,
        makerworldCatId: parseCatId(makerworldCatId),
        thingiverseCatId: parseCatId(thingiverseCatId),
        printablesCatId: parseCatId(printablesCatId),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>
        {t("models:categories.manager.metaDialogTitle", { name: folder.name || untitledLabel })}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label={t("models:categories.manager.metaTitleLabel")}
            fullWidth
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={saving}
            // Deliberate: focus the field the moment the dialog opens.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <TextField
            label={t("models:categories.manager.metaDescriptionLabel")}
            fullWidth
            multiline
            minRows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={saving}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label={t("models:categories.manager.makerworldCatIdLabel")}
              type="number"
              fullWidth
              value={makerworldCatId}
              onChange={e => setMakerworldCatId(e.target.value)}
              disabled={saving}
            />
            <TextField
              label={t("models:categories.manager.thingiverseCatIdLabel")}
              type="number"
              fullWidth
              value={thingiverseCatId}
              onChange={e => setThingiverseCatId(e.target.value)}
              disabled={saving}
            />
            <TextField
              label={t("models:categories.manager.printablesCatIdLabel")}
              type="number"
              fullWidth
              value={printablesCatId}
              onChange={e => setPrintablesCatId(e.target.value)}
              disabled={saving}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t("common:cancel")}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          {t("common:save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DeleteIcon from "@mui/icons-material/Delete";
import { type Print, printsApi } from "../../api/prints";
import { categoriesApi, type Category } from "../../api/categories";
import type { AuthUser } from "../../api/auth";
import { UnauthorizedError } from "../../api/client";
import { useConfirm } from "../../components/ConfirmProvider";
import { useToast } from "../../components/ToastProvider";
import TagInput from "../../components/TagInput";
import { translateCategoryDisplay } from "../../utils/translateCategoryDisplay";

type ImageItem =
  | { kind: "existing"; id: string; url: string }
  | { kind: "new"; localId: string; file: File; previewUrl: string };

type PlateItem =
  | { kind: "existing"; id: string; filename: string }
  | { kind: "new"; localId: string; file: File };

function imageKey(img: ImageItem): string {
  return img.kind === "existing" ? img.id : img.localId;
}

function plateKey(p: PlateItem): string {
  return p.kind === "existing" ? p.id : p.localId;
}

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const swapIndex = index + dir;
  if (index < 0 || swapIndex < 0 || swapIndex >= list.length) return list;
  const next = [...list];
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

type Props = {
  print: Print;
  onClose: () => void;
  onUnauthorized?: () => void;
  onUpdated: (print: Print) => void;
  /** Only used as a fallback when the print has neither an Author nor a plain `creator` string --
   *  a direct upload has no import-source author at all, so this shows the viewer's own identity
   *  instead of "Unknown" (see ModelCard/ModelSidePanel's identical showViewerAsAuthor fallback).
   *  Purely a label here: there's no Author id behind it, so "Reset author" stays hidden either
   *  way (hasImportedAuthor already only looks at real author/creator/source_provider data). */
  viewer?: AuthUser | null;
};

/** The "Edit" modal for a model: title, category (a two-level tree, but only leaf/secondary
 *  categories are selectable), author (a "reset to me" action that also clears the import source),
 *  preview images (delete/upload/reorder, position 0 is the main/default image), description,
 *  tags, and the model's files/plates (delete/upload/reorder). Everything here is staged locally
 *  and only committed -- as a sequence of the existing field-scoped mutation calls -- when
 *  "Update" is clicked; "Cancel" discards it all, confirming first if anything was actually
 *  touched. Opened from ModelActionsMenu's "Edit" item, shared by the model detail page's header
 *  and the Models/Collection grids' per-card menu. */
export default function EditModelModal({ print, onClose, onUnauthorized, onUpdated, viewer }: Props) {
  const { t, i18n } = useTranslation(["models", "common"]);
  const confirmDialog = useConfirm();
  const showToast = useToast();

  const [title, setTitle] = useState(print.title || print.name);
  const [categoryId, setCategoryId] = useState<string | null>(print.category_id ?? null);
  const [notes, setNotes] = useState(print.notes ?? "");
  const [tags, setTags] = useState<string[]>(print.tags);
  const hasImportedAuthor = Boolean(print.author || print.creator || print.source_provider);
  const showViewerAsAuthor = !hasImportedAuthor && Boolean(viewer);
  const [authorResetPending, setAuthorResetPending] = useState(false);
  const [images, setImages] = useState<ImageItem[]>(
    () => print.preview_images.map((img): ImageItem => ({ kind: "existing", id: img.id, url: img.url })),
  );
  // Ids the user explicitly removed via the trash icon below -- handleUpdate deletes exactly
  // these, rather than diffing the local `images` list against print.preview_images. A plain
  // upload opens straight into this modal (see useUploadImport's post-upload redirect) before its
  // automatically-generated thumbnail has necessarily finished uploading in the background; a
  // diff-based delete would treat that not-yet-known image as "removed" the moment it appears and
  // destroy it the instant "Update" is clicked. Tracking removals explicitly means an image this
  // modal never learned about is simply never a delete candidate.
  const [removedImageIds, setRemovedImageIds] = useState<Set<string>>(new Set());
  const [plateItems, setPlateItems] = useState<PlateItem[]>(
    () => print.plates.map((p): PlateItem => ({ kind: "existing", id: p.id, filename: p.filename })),
  );
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createdUrlsRef = useRef<string[]>([]);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => setCategories([]));
  }, []);

  const markDirty = () => setDirty(true);

  const { roots, childrenByParent } = useMemo(() => {
    const list = categories ?? [];
    const childrenMap: Record<string, Category[]> = {};
    const rootList: Category[] = [];
    for (const c of list) {
      if (c.parent_id) {
        if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
        childrenMap[c.parent_id].push(c);
      } else {
        rootList.push(c);
      }
    }
    const byPosition = (a: Category, b: Category) => a.position - b.position || a.name.localeCompare(b.name);
    Object.keys(childrenMap).forEach((key) => { childrenMap[key] = childrenMap[key].toSorted(byPosition); });
    return { roots: rootList.toSorted(byPosition), childrenByParent: childrenMap };
  }, [categories]);
  const categoryName = (c: Category) => translateCategoryDisplay(c, i18n).name;

  const onAddImages = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const newItems: ImageItem[] = Array.from(fileList).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      createdUrlsRef.current.push(previewUrl);
      return { kind: "new", localId: crypto.randomUUID(), file, previewUrl };
    });
    setImages((prev) => [...prev, ...newItems]);
    markDirty();
  };
  const removeImage = (key: string) => {
    const target = images.find((img) => imageKey(img) === key);
    if (target?.kind === "existing") {
      setRemovedImageIds((ids) => new Set(ids).add(target.id));
    }
    setImages((prev) => prev.filter((img) => imageKey(img) !== key));
    markDirty();
  };
  const moveImageBy = (key: string, dir: -1 | 1) => {
    setImages((prev) => moveItem(prev, prev.findIndex((img) => imageKey(img) === key), dir));
    markDirty();
  };

  const onAddFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const newItems: PlateItem[] = Array.from(fileList).map((file) => ({ kind: "new", localId: crypto.randomUUID(), file }));
    setPlateItems((prev) => [...prev, ...newItems]);
    markDirty();
  };
  const removePlateItem = (key: string) => {
    setPlateItems((prev) => (prev.length <= 1 ? prev : prev.filter((p) => plateKey(p) !== key)));
    markDirty();
  };
  const movePlateItemBy = (key: string, dir: -1 | 1) => {
    setPlateItems((prev) => moveItem(prev, prev.findIndex((p) => plateKey(p) === key), dir));
    markDirty();
  };

  const requestClose = async () => {
    if (saving) return;
    if (dirty) {
      const confirmed = await confirmDialog({
        message: t("models:edit.confirmDiscard"),
        confirmLabel: t("models:edit.discardConfirmLabel"),
        destructive: true,
      });
      if (!confirmed) return;
    }
    onClose();
  };

  const handleUpdate = async () => {
    setSaving(true);
    setError(null);
    let latest: Print = print;
    try {
      const metaRes = await printsApi.updateMeta(print.id, { title, notes });
      latest = metaRes.print ?? latest;

      const catRes = await printsApi.updateCategory(print.id, categoryId);
      latest = catRes.print ?? latest;

      const tagsRes = await printsApi.setTags(print.id, tags);
      latest = tagsRes.print ?? latest;

      if (authorResetPending) {
        const authorRes = await printsApi.resetAuthor(print.id);
        latest = authorRes.print ?? latest;
      }

      // Preview images: delete only what the user explicitly removed (see removedImageIds' doc
      // comment for why this isn't a diff against print.preview_images), upload what's new, then
      // reorder to the arrangement the user actually left on screen.
      for (const id of removedImageIds) {
        const res = await printsApi.deletePreviewImage(print.id, id);
        latest = res.print ?? latest;
      }
      const newImageFiles = images.filter((img) => img.kind === "new").map((img) => img.file);
      let newImageIdsInOrder: string[] = [];
      if (newImageFiles.length) {
        const beforeIds = new Set(latest.preview_images.map((img) => img.id));
        const uploadRes = await printsApi.addPreviewImages(print.id, newImageFiles);
        latest = uploadRes.print;
        newImageIdsInOrder = latest.preview_images
          .filter((img) => !beforeIds.has(img.id))
          .toSorted((a, b) => a.position - b.position)
          .map((img) => img.id);
      }
      if (images.length) {
        let nextNew = 0;
        const known = images.map((img) => (img.kind === "existing" ? img.id : newImageIdsInOrder[nextNew++]));
        // The reorder endpoint requires an exhaustive id list (see previewImages.ts's reorder
        // route). `known` may not be exhaustive -- it can't include an image this modal never
        // learned about (again, the background-generated-thumbnail case) -- so anything else
        // currently in `latest` gets appended after it, in its own existing order, rather than
        // tripping that endpoint's 400 or (the old bug) getting silently deleted.
        const knownIds = new Set(known);
        const unknown = latest.preview_images
          .filter((img) => !knownIds.has(img.id))
          .toSorted((a, b) => a.position - b.position)
          .map((img) => img.id);
        const finalOrder = [...known, ...unknown];
        const reorderRes = await printsApi.reorderPreviewImages(print.id, finalOrder);
        latest = reorderRes.print ?? latest;
      }

      // Model files (plates): same delete -> upload -> reorder sequence. Always at least one
      // plate stays staged locally (removePlateItem refuses to drop the last one), matching the
      // backend's own "can't remove the only plate" rule.
      const keptPlateIds = new Set(plateItems.filter((p) => p.kind === "existing").map((p) => p.id));
      for (const original of print.plates) {
        if (keptPlateIds.has(original.id)) continue;
        const res = await printsApi.deletePlate(print.id, original.id);
        latest = res.print ?? latest;
      }
      const newPlateFiles = plateItems.filter((p) => p.kind === "new").map((p) => p.file);
      let newPlateIdsInOrder: string[] = [];
      if (newPlateFiles.length) {
        const beforeIds = new Set(latest.plates.map((p) => p.id));
        const uploadRes = await printsApi.addPlates(print.id, newPlateFiles);
        latest = uploadRes.print;
        newPlateIdsInOrder = latest.plates
          .filter((p) => !beforeIds.has(p.id))
          .toSorted((a, b) => a.position - b.position)
          .map((p) => p.id);
      }
      {
        let nextNew = 0;
        const finalOrder = plateItems.map((p) => (p.kind === "existing" ? p.id : newPlateIdsInOrder[nextNew++]));
        const reorderRes = await printsApi.reorderPlates(print.id, finalOrder);
        latest = reorderRes.print ?? latest;
      }

      onUpdated(latest);
      showToast({ message: t("models:edit.updateSuccess") });
      onClose();
    } catch (err) {
      onUpdated(latest);
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      setError(err instanceof Error ? err.message : t("models:edit.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={requestClose} fullWidth maxWidth="md">
      <DialogTitle>{t("models:edit.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t("models:edit.titleLabel")}
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            disabled={saving}
            fullWidth
            // Deliberate: focus the title field the moment the dialog opens.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />

          <FormControl fullWidth disabled={saving || !categories}>
            <InputLabel id="edit-model-category-label">{t("models:detail.category")}</InputLabel>
            <Select
              labelId="edit-model-category-label"
              label={t("models:detail.category")}
              value={categoryId ?? ""}
              onChange={(e) => { setCategoryId(e.target.value || null); markDirty(); }}
            >
              <MenuItem value="">{t("models:edit.noCategory")}</MenuItem>
              {roots.flatMap((root) => [
                // A real <ListSubheader> here would still get Select's selection/click handling
                // cloned onto it (a known MUI quirk), leaving the menu stuck open on a "click" that
                // selected nothing -- a disabled MenuItem sidesteps that entirely, since Select
                // already knows to skip disabled items.
                <MenuItem key={`h-${root.id}`} disabled divider sx={{ fontWeight: 700, opacity: "1 !important" }}>
                  {categoryName(root)}
                </MenuItem>,
              ].concat(
                (childrenByParent[root.id] ?? []).map((child) => (
                  <MenuItem key={child.id} value={child.id} sx={{ pl: 3 }}>{categoryName(child)}</MenuItem>
                )),
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              {t("models:detail.author")}
            </Typography>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2">
                {authorResetPending
                  ? t("models:edit.authorWillBeYou")
                  : (print.author?.name || print.author?.handle || print.creator ||
                     (showViewerAsAuthor ? viewer!.display_name : null) || t("models:card.unknownAuthor"))}
              </Typography>
              {hasImportedAuthor && (
                authorResetPending ? (
                  <Button size="small" disabled={saving} onClick={() => setAuthorResetPending(false)}>
                    {t("models:edit.undoResetAuthor")}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    disabled={saving}
                    startIcon={<RestartAltIcon fontSize="small" />}
                    onClick={() => { setAuthorResetPending(true); markDirty(); }}
                  >
                    {t("models:edit.resetAuthor")}
                  </Button>
                )
              )}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("models:edit.previewImages")}</Typography>
            <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
              {images.map((img, idx) => {
                const key = imageKey(img);
                const src = img.kind === "existing" ? printsApi.fileUrl(img.url) : img.previewUrl;
                return (
                  <Box
                    key={key}
                    sx={{
                      position: "relative",
                      flexShrink: 0,
                      width: 96,
                      height: 96,
                      borderRadius: 1,
                      overflow: "hidden",
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box component="img" src={src} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {idx === 0 && (
                      <Chip
                        label={t("models:edit.thumbnailBadge")}
                        size="small"
                        sx={{ position: "absolute", bottom: 3, left: 3, height: 18, fontSize: 10 }}
                      />
                    )}
                    <IconButton
                      size="small"
                      disabled={saving}
                      onClick={() => removeImage(key)}
                      sx={{ position: "absolute", top: 2, right: 2, bgcolor: "rgba(0,0,0,0.55)", color: "#fff", "&:hover": { bgcolor: "rgba(0,0,0,0.75)" } }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                    <Stack direction="row" sx={{ position: "absolute", bottom: 2, right: 2 }}>
                      <IconButton
                        size="small"
                        disabled={saving || idx === 0}
                        onClick={() => moveImageBy(key, -1)}
                        sx={{ color: "#fff", bgcolor: "rgba(0,0,0,0.55)", "&:hover": { bgcolor: "rgba(0,0,0,0.75)" } }}
                      >
                        <ChevronLeftIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={saving || idx === images.length - 1}
                        onClick={() => moveImageBy(key, 1)}
                        sx={{ color: "#fff", bgcolor: "rgba(0,0,0,0.55)", "&:hover": { bgcolor: "rgba(0,0,0,0.75)" } }}
                      >
                        <ChevronRightIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Stack>
                  </Box>
                );
              })}
              <Box
                component="button"
                type="button"
                disabled={saving}
                onClick={() => addImageInputRef.current?.click()}
                sx={{
                  flexShrink: 0,
                  width: 96,
                  height: 96,
                  borderRadius: 1,
                  border: "1px dashed",
                  borderColor: "divider",
                  bgcolor: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  color: "text.secondary",
                }}
              >
                <AddPhotoAlternateIcon fontSize="small" />
                <Typography variant="caption">{t("common:add")}</Typography>
              </Box>
              <input
                ref={addImageInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { onAddImages(e.target.files); e.target.value = ""; }}
              />
            </Stack>
          </Box>

          <TextField
            label={t("models:detail.description")}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); markDirty(); }}
            disabled={saving}
            fullWidth
            multiline
            minRows={3}
          />

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {t("models:detail.tags")}
            </Typography>
            <TagInput value={tags} onChange={(v) => { setTags(v); markDirty(); }} />
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("models:edit.modelFiles")}</Typography>
            <Stack spacing={1}>
              {plateItems.map((p, idx) => {
                const key = plateKey(p);
                const filename = p.kind === "existing" ? p.filename : p.file.name;
                return (
                  <Stack
                    key={key}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, px: 1, py: 0.5 }}
                  >
                    <InsertDriveFileIcon fontSize="small" color="action" />
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>{filename}</Typography>
                    {p.kind === "new" && <Chip label={t("models:edit.newBadge")} size="small" />}
                    <IconButton size="small" disabled={saving || idx === 0} onClick={() => movePlateItemBy(key, -1)}>
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={saving || idx === plateItems.length - 1} onClick={() => movePlateItemBy(key, 1)}>
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={saving || plateItems.length <= 1} onClick={() => removePlateItem(key)}>
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </Stack>
                );
              })}
              <Button
                size="small"
                disabled={saving}
                startIcon={<UploadFileIcon fontSize="small" />}
                onClick={() => addFileInputRef.current?.click()}
                sx={{ alignSelf: "flex-start" }}
              >
                {t("models:edit.addFiles")}
              </Button>
              <input
                ref={addFileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => { onAddFiles(e.target.files); e.target.value = ""; }}
              />
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={requestClose} disabled={saving}>{t("common:cancel")}</Button>
        <Button
          variant="contained"
          onClick={handleUpdate}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {t("models:edit.update")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

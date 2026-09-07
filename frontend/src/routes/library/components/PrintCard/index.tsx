import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";
import LayersIcon from "@mui/icons-material/Layers";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import FolderIcon from "@mui/icons-material/Folder";
import EditIcon from "@mui/icons-material/Edit";
import { type Print, UnauthorizedError, addPlates, deletePreparedPrint } from "../../../../services/api";
import { type PreviewSettings } from "../../../../services/settings";
import { type ResolvedTheme } from "../../../../constants/settingsOptions";
import { MODEL_EXTS, ENGRAVING_EXTS } from "../../../../constants/fileTypes";
import { extOf } from "../../../../utils/fileExtensions";
import { entriesFromDataTransfer } from "../../../../services/uploadTree";
import TagBadge from "../../../../common/TagBadge";
import TagInput from "../../../../common/TagInput";
import PreparedPrintSummary from "../PreparedPrintSummary";
import { renderPreviewContent } from "../renderPreviewContent";
import SupportingFilesPanel from "./components/SupportingFilesPanel";

export default function PrintCard({
  item,
  onSaveTags,
  onSaveDetails,
  onRename,
  onPreview,
  onDownloadSingle,
  onDownloadByTag,
  onDownloadSelected,
  downloading,
  onDelete,
  deleting,
  onMoveFolder,
  folderOptions,
  moving,
  selected,
  onToggleSelected,
  hasSelection,
  bulkDownloading,
  slicerEnabled,
  slicerLabel,
  onOpenInSlicer,
  engravingEnabled,
  engraverLabel,
  onOpenInEngraving,
  theme,
  previewMode,
  onPrintChanged,
  onUnauthorized,
}: {
  item: Print;
  onSaveTags: (id: string, tags: string[]) => void;
  onSaveDetails: (id: string, payload: { notes: string; creator: string; collection: string }) => void;
  onRename: (id: string, filename: string) => void;
  onPreview: (print: Print | null) => void;
  onDownloadSingle: (print: Print) => void;
  onDownloadByTag: (tag: string) => void;
  onDownloadSelected: () => void;
  downloading: boolean;
  onDelete: (print: Print) => void;
  deleting: boolean;
  onMoveFolder: (id: string, folder_id: string | null) => void;
  folderOptions: { id: string | null; name: string }[];
  moving: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  hasSelection: boolean;
  bulkDownloading: boolean;
  slicerEnabled: boolean;
  slicerLabel: string;
  onOpenInSlicer: (print: Print) => void;
  engravingEnabled: boolean;
  engraverLabel: string;
  onOpenInEngraving: (print: Print) => void;
  theme: ResolvedTheme;
  previewMode: PreviewSettings["mode"];
  onPrintChanged: (print: Print) => void;
  onUnauthorized?: () => void;
}) {
  const { t } = useTranslation(["library", "common"]);
  const [editingTags, setEditingTags] = useState(false);
  const [tagList, setTagList] = useState<string[]>(item.tags);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(item.notes || "");
  const [creatorValue, setCreatorValue] = useState(item.creator || "");
  const [collectionValue, setCollectionValue] = useState(item.collection || "");
  const [notesCollapsed, setNotesCollapsed] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(item.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<HTMLElement | null>(null);
  const [folderMenuAnchor, setFolderMenuAnchor] = useState<HTMLElement | null>(null);
  const [preparedClearing, setPreparedClearing] = useState(false);
  const [plateDropActive, setPlateDropActive] = useState(false);
  const [addingPlates, setAddingPlates] = useState(false);
  const plateDragDepth = useRef(0);

  useEffect(() => {
    if (!editingTags) {
      setTagList(item.tags);
    }
  }, [item.tags, editingTags]);

  useEffect(() => {
    if (!editingNotes) {
      setNotesValue(item.notes || "");
      setCreatorValue(item.creator || "");
      setCollectionValue(item.collection || "");
    }
  }, [item.notes, item.creator, item.collection, editingNotes]);

  useEffect(() => {
    if (!renaming) {
      setNameValue(item.name);
    } else {
      setTimeout(() => nameInputRef.current?.select(), 0);
    }
  }, [item.name, renaming]);

  const clearPreparedPrint = async () => {
    if (!window.confirm(t("library:confirm.clearPrepared"))) return;
    setPreparedClearing(true);
    try {
      onPrintChanged(await deletePreparedPrint(item.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("library:errors.clearPreparedFailed"));
    } finally {
      setPreparedClearing(false);
    }
  };

  const startEditing = () => {
    setTagList(item.tags);
    setEditingTags(true);
  };

  const cancelEditing = () => {
    setEditingTags(false);
    setTagList(item.tags);
  };

  const save = async () => {
    await onSaveTags(item.id, tagList);
    setEditingTags(false);
  };

  const saveNotes = async () => {
    await onSaveDetails(item.id, {
      notes: notesValue,
      creator: creatorValue,
      collection: collectionValue,
    });
    setEditingNotes(false);
  };

  const cancelNotes = () => {
    setEditingNotes(false);
    setNotesValue(item.notes || "");
    setCreatorValue(item.creator || "");
    setCollectionValue(item.collection || "");
  };

  const noteText = (item.notes || "").trim();

  const commitRename = async () => {
    const next = nameValue.trim();
    if (!next) {
      setNameValue(item.name);
      setRenaming(false);
      return;
    }
    if (next === item.name) {
      setRenaming(false);
      return;
    }
    try {
      await onRename(item.id, next);
    } catch (err) {
      console.error(err);
      alert(t("library:errors.renameFailed"));
      setNameValue(item.name);
    } finally {
      setRenaming(false);
    }
  };

  const cancelRename = () => {
    setNameValue(item.name);
    setRenaming(false);
  };

  const handleRenameKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  };

  const primaryPlate = item.plates[0];
  const primaryExt = extOf(primaryPlate?.filename || "");
  const canOpenInSlicer = slicerEnabled && (Boolean(item.prepared_print) || MODEL_EXTS.has(primaryExt));
  const canOpenInEngraving = engravingEnabled && ENGRAVING_EXTS.has(primaryExt);
  const isMultiPlate = item.plates.length > 1;
  const currentFolderName = folderOptions.find(opt => (opt.id || null) === (item.folder_id || null))?.name
    || t("common:unassigned");

  const isFileDragCard = (e: React.DragEvent<HTMLDivElement>) =>
    Array.from(e.dataTransfer?.types || []).includes("Files");

  const handleCardDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragCard(e)) return;
    e.preventDefault();
    e.stopPropagation();
    plateDragDepth.current += 1;
    setPlateDropActive(true);
  };

  const handleCardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragCard(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCardDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragCard(e)) return;
    e.preventDefault();
    e.stopPropagation();
    plateDragDepth.current -= 1;
    if (plateDragDepth.current <= 0) {
      plateDragDepth.current = 0;
      setPlateDropActive(false);
    }
  };

  const handleCardDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragCard(e)) return;
    e.preventDefault();
    // Stop this from also bubbling up to the grid's "drop anywhere uploads a
    // new item" handler -- dropping onto an existing print card always means
    // "add these as plate(s) of this print".
    e.stopPropagation();
    plateDragDepth.current = 0;
    setPlateDropActive(false);
    const entries = await entriesFromDataTransfer(e.dataTransfer);
    const files = entries.map(entry => entry.file);
    if (!files.length) return;
    setAddingPlates(true);
    try {
      const { print: updated } = await addPlates(item.id, files);
      onPrintChanged(updated);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      alert(err instanceof Error ? err.message : t("library:errors.addPlatesFailed"));
    } finally {
      setAddingPlates(false);
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        overflow: "hidden",
        borderColor: plateDropActive ? "primary.main" : "divider",
        outline: plateDropActive ? "2px solid" : "none",
        outlineColor: "primary.main",
        transition: "border-color 0.15s ease",
      }}
      onDragEnter={handleCardDragEnter}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
    >
      <Tooltip title={t("library:card.doubleClickPreview")}>
        <Box
          sx={{ height: 160, position: "relative", cursor: "pointer", bgcolor: "action.hover" }}
          onDoubleClick={() => onPreview(item)}
          onClick={e => e.stopPropagation()}
        >
          {renderPreviewContent(item, "card", theme, t, previewMode)}
          {isMultiPlate && (
            <Chip
              icon={<LayersIcon sx={{ fontSize: 14, color: "common.white !important" }} />}
              label={t("library:card.plateCountBadge", { count: item.plates.length })}
              size="small"
              sx={{
                position: "absolute",
                bottom: 6,
                right: 6,
                bgcolor: "rgba(0, 0, 0, 0.7)",
                color: "common.white",
                fontSize: 11,
                height: 22,
              }}
            />
          )}
          {(plateDropActive || addingPlates) && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(0, 0, 0, 0.45)",
                pointerEvents: "none",
              }}
            >
              <Paper elevation={3} sx={{ px: 1.5, py: 0.75 }}>
                <Typography variant="caption">
                  {addingPlates ? t("library:card.addingPlates") : t("library:card.dropToAddPlate")}
                </Typography>
              </Paper>
            </Box>
          )}
        </Box>
      </Tooltip>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {item.prepared_print && (
          <PreparedPrintSummary
            prepared={item.prepared_print}
            onClear={item.prepared_print.removable ? clearPreparedPrint : undefined}
            clearing={preparedClearing}
          />
        )}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={<Checkbox size="small" checked={selected} onChange={onToggleSelected} />}
            label={<Typography variant="body2">{t("library:card.select")}</Typography>}
          />
          <Stack direction="row" alignItems="center" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              endIcon={<DownloadIcon fontSize="small" />}
              disabled={downloading || bulkDownloading}
              onClick={e => setDownloadMenuAnchor(e.currentTarget)}
            >
              {downloading
                ? t("library:card.downloading")
                : bulkDownloading
                  ? t("library:card.preparing")
                  : t("library:card.downloadPlaceholder")}
            </Button>
            <Menu anchorEl={downloadMenuAnchor} open={Boolean(downloadMenuAnchor)} onClose={() => setDownloadMenuAnchor(null)}>
              <MenuItem onClick={() => { setDownloadMenuAnchor(null); onDownloadSingle(item); }}>
                {isMultiPlate ? t("library:card.downloadAllPlatesZip") : t("library:card.downloadFile")}
              </MenuItem>
              <MenuItem
                disabled={!hasSelection}
                onClick={() => { setDownloadMenuAnchor(null); onDownloadSelected(); }}
              >
                {t("library:card.downloadSelected")}
              </MenuItem>
              {item.tags.map(tg => (
                <MenuItem key={`tag-${tg}`} onClick={() => { setDownloadMenuAnchor(null); onDownloadByTag(tg); }}>
                  {t("library:card.downloadTag", { tag: tg })}
                </MenuItem>
              ))}
            </Menu>
          </Stack>
        </Stack>
        {(canOpenInSlicer || canOpenInEngraving) && (
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} justifyContent="flex-end">
            {canOpenInSlicer && (
              <Button
                size="small"
                variant="text"
                disabled={downloading || bulkDownloading}
                onClick={() => onOpenInSlicer(item)}
              >
                {t("library:card.openInSlicer", { slicer: slicerLabel })}
              </Button>
            )}
            {canOpenInEngraving && (
              <Button
                size="small"
                variant="text"
                disabled={downloading || bulkDownloading}
                onClick={() => onOpenInEngraving(item)}
              >
                {t("library:card.openInEngraving", { engraver: engraverLabel })}
              </Button>
            )}
          </Stack>
        )}
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", color: "text.secondary" }}>
            {moving ? t("library:card.folderUpdating") : t("library:card.folderLabel")}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FolderIcon fontSize="small" />}
            disabled={moving}
            onClick={e => setFolderMenuAnchor(e.currentTarget)}
            sx={{ justifyContent: "flex-start" }}
          >
            {currentFolderName}
          </Button>
          <Menu anchorEl={folderMenuAnchor} open={Boolean(folderMenuAnchor)} onClose={() => setFolderMenuAnchor(null)}>
            {folderOptions.map(opt => (
              <MenuItem
                key={opt.id || "none"}
                selected={(opt.id || null) === (item.folder_id || null)}
                onClick={() => {
                  setFolderMenuAnchor(null);
                  if ((opt.id || null) !== (item.folder_id || null)) onMoveFolder(item.id, opt.id);
                }}
              >
                {opt.name}
              </MenuItem>
            ))}
          </Menu>
        </Stack>
        <Box
          title={t("library:card.titleTooltip", { name: item.name, filename: primaryPlate?.filename || "" })}
          onDoubleClick={e => { e.stopPropagation(); setRenaming(true); }}
          onClick={e => renaming && e.stopPropagation()}
        >
          {renaming ? (
            <TextField
              inputRef={nameInputRef}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              onClick={e => e.stopPropagation()}
              size="small"
              fullWidth
              autoFocus
            />
          ) : (
            <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
          )}
        </Box>
        <Typography variant="caption" color="text.disabled" noWrap title={primaryPlate?.filename || ""}>
          {isMultiPlate
            ? t("library:card.morePlates", { filename: primaryPlate?.filename || "", count: item.plates.length - 1 })
            : (primaryPlate?.filename || "")}
        </Typography>
        {(item.creator || item.collection) && (
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5}>
            {item.creator && (
              <Typography variant="caption" color="text.secondary">
                {t("library:card.byCreator", { creator: item.creator })}
              </Typography>
            )}
            {item.collection && (
              <Typography variant="caption" color="text.secondary">
                {t("library:card.collectionLabel", { collection: item.collection })}
              </Typography>
            )}
          </Stack>
        )}
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
          {item.tags.length ? (
            item.tags.map(tg => <TagBadge key={tg} tag={tg} />)
          ) : (
            <Typography variant="caption" color="text.disabled">{t("library:card.noTags")}</Typography>
          )}
        </Stack>
        <SupportingFilesPanel item={item} onPrintChanged={onPrintChanged} />
        <Paper variant="outlined" sx={{ borderStyle: "dashed", p: 1, display: "flex", flexDirection: "column", gap: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" sx={{ textTransform: "uppercase", color: "text.secondary" }}>
              {t("library:card.modelDetails")}
            </Typography>
            <Button size="small" onClick={() => setNotesCollapsed(v => !v)}>
              {notesCollapsed ? t("library:card.expand") : t("library:card.collapse")}
            </Button>
          </Stack>
          {!notesCollapsed && (
            <>
              {editingNotes ? (
                <>
                  <TextField
                    label={t("common:creator")}
                    value={creatorValue}
                    onChange={e => setCreatorValue(e.target.value)}
                    placeholder={t("library:card.creatorPlaceholder")}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label={t("common:collection")}
                    value={collectionValue}
                    onChange={e => setCollectionValue(e.target.value)}
                    placeholder={t("library:card.collectionPlaceholder")}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label={t("common:notes")}
                    value={notesValue}
                    onChange={e => setNotesValue(e.target.value)}
                    placeholder={t("library:card.notesPlaceholder")}
                    size="small"
                    fullWidth
                    multiline
                    minRows={3}
                  />
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                    <Button size="small" variant="contained" onClick={saveNotes}>{t("common:save")}</Button>
                    <Button size="small" variant="outlined" onClick={cancelNotes}>{t("common:cancel")}</Button>
                  </Stack>
                </>
              ) : (
                <>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                    <Box>
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ textTransform: "uppercase" }}>
                        {t("common:creator")}
                      </Typography>
                      <Typography variant="body2">{item.creator || t("library:card.notSet")}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ textTransform: "uppercase" }}>
                        {t("common:collection")}
                      </Typography>
                      <Typography variant="body2">{item.collection || t("library:card.notSet")}</Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: noteText ? "text.primary" : "text.disabled" }}>
                    {noteText || t("library:card.addNotes")}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon fontSize="small" />}
                    sx={{ alignSelf: "flex-start" }}
                    onClick={() => setEditingNotes(true)}
                  >
                    {t("library:card.editDetails")}
                  </Button>
                </>
              )}
            </>
          )}
          {notesCollapsed && (
            <Typography variant="body2" sx={{ color: noteText ? "text.primary" : "text.disabled" }}>
              {noteText
                ? `${noteText.slice(0, 60)}${noteText.length > 60 ? "..." : ""}`
                : [item.creator, item.collection].filter(Boolean).join(" · ") || t("library:card.noDetails")}
            </Typography>
          )}
        </Paper>

        {editingTags ? (
          <Stack spacing={1}>
            <TagInput
              value={tagList}
              onChange={setTagList}
              placeholder={t("library:card.tagInputPlaceholder")}
            />
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
              <Button size="small" variant="contained" onClick={save}>{t("common:save")}</Button>
              <Button size="small" variant="outlined" onClick={cancelEditing}>{t("common:cancel")}</Button>
            </Stack>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
            <Button size="small" variant="outlined" onClick={startEditing}>{t("library:card.editTags")}</Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon fontSize="small" />}
              onClick={() => onDelete(item)}
              disabled={deleting}
            >
              {deleting ? t("library:card.deleting") : t("common:delete")}
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

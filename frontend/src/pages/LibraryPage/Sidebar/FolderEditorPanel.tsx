import React from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import TagInput from "../../../components/TagInput";

export type FolderOption = { id: string | null; name: string };

type Props = {
  /** "create" omits the tags field (new folders start untagged); "edit" includes it. */
  mode: "create" | "edit";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  name: string;
  onNameChange: (name: string) => void;
  namePlaceholder?: string;
  parentId: string | null;
  onParentChange: (id: string | null) => void;
  folderOptions: FolderOption[];
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  tagsPlaceholder?: string;
  busy: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

/** The inline "New folder" / "Edit folder" panel shown below the tree -- one shared shape for
 *  both modes, since they differ only in heading copy, the presence of a tags field, and the
 *  submit action. */
export default function FolderEditorPanel({
  mode,
  icon,
  title,
  subtitle,
  name,
  onNameChange,
  namePlaceholder,
  parentId,
  onParentChange,
  folderOptions,
  tags,
  onTagsChange,
  tagsPlaceholder,
  busy,
  submitLabel,
  submitDisabled,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation(["app", "common"]);
  const locationLabelId = `${mode}-folder-location-label`;
  return (
    <Dialog
      open
      onClose={onCancel}
      fullWidth
      maxWidth="xs"
      aria-label={title}
      slotProps={{ paper: { sx: { p: 1.5, borderRadius: 2 } } }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
        <Box sx={{ mt: 0.25, display: "flex" }}>{icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2">{title}</Typography>
          <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
        </Box>
        <IconButton size="small" onClick={onCancel} aria-label={t("common:cancel") ?? undefined}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Stack spacing={1.5}>
        <TextField
          size="small"
          label={t("sidebar.nameLabel")}
          value={name}
          onChange={e => onNameChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder={namePlaceholder}
          fullWidth
        />
        <FormControl size="small" fullWidth>
          <InputLabel id={locationLabelId}>{t("sidebar.locationLabel")}</InputLabel>
          <Select
            labelId={locationLabelId}
            label={t("sidebar.locationLabel")}
            value={parentId || ""}
            onChange={e => onParentChange((e.target.value as string) || null)}
          >
            {folderOptions.map(opt => (
              <MenuItem key={opt.id ?? "root"} value={opt.id || ""}>{opt.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {mode === "edit" && (
          <TagInput value={tags || []} onChange={onTagsChange || (() => {})} placeholder={tagsPlaceholder} />
        )}
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            startIcon={<CheckIcon fontSize="small" />}
            disabled={busy || submitDisabled}
            onClick={onSubmit}
          >
            {submitLabel}
          </Button>
          <Button size="small" onClick={onCancel}>
            {t("common:cancel")}
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
}

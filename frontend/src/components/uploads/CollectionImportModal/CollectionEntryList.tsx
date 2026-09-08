import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import { useTranslation } from "react-i18next";
import type { ImportCollectionEntry } from "../../../api/imports";

type Props = {
  entries: ImportCollectionEntry[];
  selected: Set<string>;
  busy: boolean;
  noEntriesLabel: string;
  onToggleEntry: (designId: string) => void;
};

/** The scrollable checkbox list shown in the collection import wizard's "select models" step
 * -- one row per MakerWorld design, with its cover thumbnail so it's recognizable at a glance
 * (unlike ZipEntryList's plain filenames, a collection's entries are only meaningfully told
 * apart by what they look like). Entries already in the user's library (already_imported, from
 * the backend's bulk dedup check -- see findImportedExternalIds) are shown dimmed with their
 * checkbox disabled instead of left selectable: re-importing would just hit the same dedup and
 * do nothing, so there's no point offering it. */
export default function CollectionEntryList({ entries, selected, busy, noEntriesLabel, onToggleEntry }: Props) {
  const { t } = useTranslation("app");
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, maxHeight: 420, overflow: "auto" }}>
      {entries.map(entry => (
        <FormControlLabel
          key={entry.design_id}
          sx={{
            display: "flex",
            alignItems: "center",
            m: 0,
            px: 1.5,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            "&:last-of-type": { borderBottom: "none" },
            opacity: entry.already_imported ? 0.5 : 1,
          }}
          control={
            <Checkbox
              checked={selected.has(entry.design_id)}
              onChange={() => onToggleEntry(entry.design_id)}
              disabled={busy || entry.already_imported}
              size="small"
            />
          }
          label={
            <Stack direction="row" sx={{ width: "100%", minWidth: 0 }} alignItems="center" spacing={1.5}>
              <Box
                component="img"
                src={entry.cover ?? undefined}
                alt=""
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 0.5,
                  objectFit: "cover",
                  flexShrink: 0,
                  bgcolor: "action.hover",
                  visibility: entry.cover ? "visible" : "hidden",
                }}
              />
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {entry.title}
              </Typography>
              {entry.already_imported && (
                <Chip label={t("collectionImport.alreadyImported")} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
              )}
            </Stack>
          }
        />
      ))}
      {entries.length === 0 && (
        <Box sx={{ px: 1.5, py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {noEntriesLabel}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

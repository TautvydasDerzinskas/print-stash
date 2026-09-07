import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
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
 * apart by what they look like). */
export default function CollectionEntryList({ entries, selected, busy, noEntriesLabel, onToggleEntry }: Props) {
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
          }}
          control={
            <Checkbox
              checked={selected.has(entry.design_id)}
              onChange={() => onToggleEntry(entry.design_id)}
              disabled={busy}
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

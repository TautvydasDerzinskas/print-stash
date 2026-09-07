import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import { formatFileSize } from "../../../utils/fileSize";
import type { ZipEntry } from "../../../utils/zipUtils";

type Props = {
  entries: ZipEntry[];
  selected: Set<string>;
  busy: boolean;
  noFilesLabel: string;
  onToggleEntry: (path: string) => void;
};

/** The scrollable checkbox list shown in the zip import wizard's "select files" step. */
export default function ZipEntryList({ entries, selected, busy, noFilesLabel, onToggleEntry }: Props) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, maxHeight: 360, overflow: "auto" }}>
      {entries.map(entry => (
        <FormControlLabel
          key={entry.path}
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
              checked={selected.has(entry.path)}
              onChange={() => onToggleEntry(entry.path)}
              disabled={busy}
              size="small"
            />
          }
          label={
            <Stack direction="row" sx={{ width: "100%", minWidth: 0 }} alignItems="center" spacing={1}>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {entry.path}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(entry.size)}
              </Typography>
            </Stack>
          }
        />
      ))}
      {entries.length === 0 && (
        <Box sx={{ px: 1.5, py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {noFilesLabel}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

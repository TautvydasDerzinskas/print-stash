import React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

type Props = {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backLabel?: string;
};

/** Shared heading row for a Settings (or Admin Settings) section: title/subtitle on the left,
 *  and -- only when the section is reached by drilling into a root menu grid -- a "Back" button
 *  on the right that returns to it. Sections rendered together on one page (nothing to go back
 *  to) simply omit onBack. */
export default function SectionHeader({ title, subtitle, onBack, backLabel }: Props) {
  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
      <Box>
        <Typography variant="h5" fontWeight={600}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
      </Box>
      {onBack && <Button variant="outlined" size="small" onClick={onBack}>{backLabel}</Button>}
    </Stack>
  );
}

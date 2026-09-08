import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import { useImportJob } from "./ImportJobContext";

/** A fixed bar pinned to the bottom of the viewport, shown app-wide for as long as a batch
 *  import (MakerWorld collection or remote zip) is running -- hovering it shows the full
 *  imported/already-in-library/failed breakdown. */
export default function ImportProgressBar() {
  const { t } = useTranslation("app");
  const { activeJob } = useImportJob();
  if (!activeJob) return null;

  const { total, processed, imported, already_in_library: alreadyInLibrary, failed_count: failedCount } = activeJob;
  const progressValue = total > 0 ? Math.min(100, (processed / total) * 100) : 0;
  const label = total > 0
    ? t("importProgress.label", { processed, total })
    : t("importProgress.starting");
  const tooltip = t("importProgress.tooltip", { imported, alreadyInLibrary, failedCount });

  return (
    <Tooltip title={tooltip} placement="top">
      <Box
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (theme) => theme.zIndex.snackbar,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
          px: 2,
          py: 0.75,
        }}
      >
        <Stack spacing={0.5} sx={{ maxWidth: 480, mx: "auto" }}>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            {label}
          </Typography>
          <LinearProgress
            variant={total > 0 ? "determinate" : "indeterminate"}
            value={progressValue}
            sx={{ borderRadius: 1, height: 6 }}
          />
        </Stack>
      </Box>
    </Tooltip>
  );
}

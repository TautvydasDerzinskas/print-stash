import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import FolderIcon from "@mui/icons-material/Folder";
import LaunchIcon from "@mui/icons-material/Launch";
import DownloadIcon from "@mui/icons-material/Download";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import type { Print } from "../../api/prints";
import { printsApi } from "../../api/prints";
import { slicerLaunchUrl } from "../../utils/slicerLaunch";
import { SLICER_OPTIONS } from "../../constants/settingsOptions";
import { useSlicerPreference } from "../../hooks/useSlicerPreference";
import { useDownloadPrint } from "./useDownloadPrint";
import DownloadPickerDialog from "./DownloadPickerDialog";

type Props = {
  print: Print;
  onSelectFolder: (id: string) => void;
  onUnauthorized?: () => void;
};

/** The model detail page's right-hand summary card, sticky so it stays in view while the
 *  description/tags column scrolls: author (jumps to their author page), category (jumps back
 *  to the Models grid filtered to it), "Open in {Slicer}" (only when both a preference is set
 *  and this print has a slicer_url -- same condition ModelActionsMenu's menu item uses),
 *  "Download model files" (the same picker-or-direct-download flow as ModelActionsMenu's
 *  Download, via useDownloadPrint so the two can't drift), view/print counts, and -- only for an
 *  actually-imported print, per source_provider -- when it was imported. */
export default function ModelSidePanel({ print, onSelectFolder, onUnauthorized }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const navigate = useNavigate();
  const slicerPreference = useSlicerPreference();
  const { pickerOpen, setPickerOpen, downloading, handleDownload, downloadPlate, downloadAllZip, sortedPlates } =
    useDownloadPrint(print, onUnauthorized);

  // "other" has no registered URL protocol to launch -- treated the same as no preference set.
  const slicerOption = SLICER_OPTIONS.find(opt => opt.id === slicerPreference && opt.id !== "other");
  const openInSlicerHref = slicerOption && print.slicer_url
    ? slicerLaunchUrl(slicerOption.id, printsApi.fileUrl(print.slicer_url), print.slicer_filename ?? undefined)
    : undefined;

  const goToCategory = () => {
    if (!print.folder_id) return;
    onSelectFolder(print.folder_id);
    navigate("/models");
  };

  const importedDate = print.source_provider
    ? new Date(print.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  const authorName = print.author?.name || print.author?.handle || print.creator || null;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "12px", position: "sticky", top: 16 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            {t("models:detail.author")}
          </Typography>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              width: "fit-content",
              cursor: print.author ? "pointer" : "default",
              ...(print.author ? { "&:hover": { color: "primary.main" } } : undefined),
            }}
            onClick={() => print.author && navigate(`/authors/${print.author.id}`)}
          >
            <Avatar src={print.author?.avatar_url || undefined} sx={{ width: 28, height: 28, fontSize: 13, color: "inherit !important" }}>
              {(authorName || "?").slice(0, 1).toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ color: "inherit" }}>
              {authorName || t("models:card.unknownAuthor")}
            </Typography>
          </Stack>
        </Box>

        {print.folder_id && print.folder_name && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              {t("models:detail.category")}
            </Typography>
            <ButtonBase
              onClick={goToCategory}
              sx={{
                borderRadius: 1,
                px: 0.5,
                py: 0.25,
                mx: -0.5,
                gap: 0.75,
                color: "text.primary",
                "&:hover": { color: "primary.main" },
              }}
            >
              <FolderIcon fontSize="small" />
              <Typography variant="body2" fontWeight={600}>{print.folder_name}</Typography>
            </ButtonBase>
          </Box>
        )}

        {openInSlicerHref && (
          <Button
            component="a"
            href={openInSlicerHref}
            startIcon={<LaunchIcon fontSize="small" />}
            fullWidth
            sx={{
              bgcolor: "background.paper",
              color: "primary.main",
              border: "1.5px solid",
              borderColor: "primary.main",
              "&:hover": { bgcolor: "action.hover", borderColor: "primary.dark" },
            }}
          >
            {t("models:detail.openInSlicer", { slicer: slicerOption!.label })}
          </Button>
        )}

        <Button
          onClick={handleDownload}
          disabled={downloading}
          startIcon={<DownloadIcon fontSize="small" />}
          fullWidth
          sx={{
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { bgcolor: "primary.dark" },
          }}
        >
          {t("models:detail.downloadModelFiles")}
        </Button>

        <Stack direction="row" spacing={1.5}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            spacing={0.75}
            sx={{ flex: 1, py: 1, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
          >
            <VisibilityIcon fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography variant="body2" fontWeight={600}>{print.view_count}</Typography>
          </Stack>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            spacing={0.75}
            sx={{ flex: 1, py: 1, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
          >
            <PrintIcon fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography variant="body2" fontWeight={600}>{print.print_count}</Typography>
          </Stack>
        </Stack>

        {importedDate && (
          <Typography variant="caption" sx={{ textAlign: "right", fontSize: 12, color: "text.secondary" }}>
            {t("models:detail.imported", { date: importedDate })}
          </Typography>
        )}
      </Stack>

      <DownloadPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        downloading={downloading}
        sortedPlates={sortedPlates}
        downloadAllZip={downloadAllZip}
        downloadPlate={downloadPlate}
      />
    </Paper>
  );
}

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ButtonBase from "@mui/material/ButtonBase";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useTranslation } from "react-i18next";
import { type Print, type PrintFile, printsApi } from "../../../api/prints";
import { useConfirm } from "../../../components/ConfirmProvider";

// The "Supporting files" list/upload/remove panel on a PrintCard -- self-contained state (its own
// expanded/loading/uploading flags and file list) that only PrintCard renders, so it lives under
// PrintCard/ rather than being shared.
export default function SupportingFilesPanel({
  item,
  onPrintChanged,
}: {
  item: Print;
  onPrintChanged: (print: Print) => void;
}) {
  const { t } = useTranslation(["library"]);
  const confirmDialog = useConfirm();
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [supportingFiles, setSupportingFiles] = useState<PrintFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesUploading, setFilesUploading] = useState(false);
  const relatedInputRef = useRef<HTMLInputElement | null>(null);

  const loadSupportingFiles = async () => {
    setFilesLoading(true);
    try {
      setSupportingFiles(await printsApi.listFiles(item.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("library:errors.loadFilesFailed"));
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    if (filesExpanded) void loadSupportingFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesExpanded, item.id]);

  const addRelatedFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setFilesUploading(true);
    try {
      let updated = item;
      for (const file of files) {
        updated = await printsApi.uploadFile(item.id, file);
        onPrintChanged(updated);
      }
      setSupportingFiles(await printsApi.listFiles(item.id));
      setFilesExpanded(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("library:errors.addFilesFailed"));
    } finally {
      setFilesUploading(false);
    }
  };

  const removeRelatedFile = async (file: PrintFile) => {
    const message = t("library:confirm.removeFile", { filename: file.filename });
    if (!(await confirmDialog({ message, confirmLabel: t("common:remove"), destructive: true }))) return;
    try {
      const updated = await printsApi.deleteFile(item.id, file.id);
      onPrintChanged(updated);
      setSupportingFiles(current => current.filter(entry => entry.id !== file.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("library:errors.removeFileFailed"));
    }
  };

  return (
    <Paper variant="outlined" sx={{ fontSize: 14 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ p: 1 }}>
        <ButtonBase
          onClick={() => setFilesExpanded(value => !value)}
          sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
        >
          <Typography variant="body2" fontWeight={600}>{t("library:card.supportingFiles")}</Typography>
          <Chip
            label={item.supporting_file_count || 0}
            size="small"
            sx={{ height: 18, fontSize: 11 }}
          />
        </ButtonBase>
        <input
          ref={relatedInputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.txt,.md,.doc,.docx,.rtf,.csv,.html,.zip,.gcode,.gco,.bgcode,.3mf"
          onChange={addRelatedFiles}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadFileIcon fontSize="small" />}
          disabled={filesUploading}
          onClick={() => relatedInputRef.current?.click()}
          title={t("library:card.addFilesTooltip")}
        >
          {filesUploading ? t("library:card.addingFiles") : t("library:card.addFiles")}
        </Button>
      </Stack>
      {filesExpanded && (
        <>
          <Divider />
          <Box sx={{ px: 1, py: 1 }}>
            {filesLoading ? (
              <Typography variant="caption" color="text.secondary">{t("library:card.loadingFiles")}</Typography>
            ) : supportingFiles.length ? (
              <Stack spacing={0.5}>
                {supportingFiles.map(file => (
                  <Stack
                    key={file.id}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{ borderRadius: 1, px: 0.5, py: 0.5, "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <Typography
                      component="a"
                      href={printsApi.fileUrl(file.url)}
                      download={file.filename}
                      title={file.filename}
                      variant="caption"
                      noWrap
                      sx={{ minWidth: 0, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                    >
                      {file.filename}
                    </Typography>
                    <Button size="small" color="error" onClick={() => removeRelatedFile(file)} sx={{ minWidth: 0, fontSize: 11 }}>
                      {t("library:card.removeFile")}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">{t("library:card.supportingFilesEmpty")}</Typography>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
}

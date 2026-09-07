import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ButtonBase from "@mui/material/ButtonBase";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

export type ImportMode = "separate" | "multiplate";

type ImportModePromptConfig = {
  label: string;
  count: number;
  onChoose: (mode: ImportMode) => Promise<void>;
};

type ImportModePromptState = {
  config: ImportModePromptConfig;
};

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/**
 * Prompts the user, for a flat multi-file drop or picker selection, to choose
 * between importing each file as its own print ("separate") or bundling all
 * of them as plates of one new multi-part print ("multiplate").
 *
 * Structurally similar to useZipImportPrompt() in ZipImportModal.tsx, but
 * this is a distinct decision (single vs. multi-plate print) with its own
 * simpler one-step UI -- it intentionally does not share state with the zip
 * import wizard.
 */
export function useImportModePrompt() {
  const { t } = useTranslation("app");
  const [state, setState] = useState<ImportModePromptState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const close = () => {
    setState(null);
    setBusy(false);
    setError(null);
    if (resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  };

  const prompt = (config: ImportModePromptConfig) => {
    if (state) {
      return Promise.resolve();
    }
    setBusy(false);
    setError(null);
    setState({ config });
    return new Promise<void>(resolve => {
      resolveRef.current = resolve;
    });
  };

  const choose = async (mode: ImportMode) => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      await state.config.onChoose(mode);
      close();
    } catch (err) {
      setError(errorMessage(err, t("importMode.importError")));
      setBusy(false);
    }
  };

  const modal = state ? (
    <ImportModeModal
      label={state.config.label}
      count={state.config.count}
      busy={busy}
      error={error}
      onChoose={choose}
      onClose={close}
    />
  ) : null;

  return { prompt, modal, isOpen: Boolean(state) };
}

function ImportModeModal({
  label,
  count,
  busy,
  error,
  onChoose,
  onClose,
}: {
  label: string;
  count: number;
  busy: boolean;
  error: string | null;
  onChoose: (mode: ImportMode) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("app");
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
        <Box>
          <Typography variant="h6" component="div">{t("importMode.title", { count })}</Typography>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} disabled={busy} aria-label={t("importMode.close") ?? undefined}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">{t("importMode.prompt")}</Typography>
          <Stack spacing={1.5}>
            <ButtonBase
              onClick={() => onChoose("separate")}
              disabled={busy}
              sx={{
                textAlign: "left",
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                p: 1.5,
                display: "block",
                "&:hover": { boxShadow: 1 },
              }}
            >
              <Typography variant="subtitle2">{t("importMode.separateTitle")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("importMode.separateDesc")}
              </Typography>
            </ButtonBase>
            <ButtonBase
              onClick={() => onChoose("multiplate")}
              disabled={busy}
              sx={{
                textAlign: "left",
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                p: 1.5,
                display: "block",
                "&:hover": { boxShadow: 1 },
              }}
            >
              <Typography variant="subtitle2">{t("importMode.multiplateTitle")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("importMode.multiplateDesc")}
              </Typography>
            </ButtonBase>
          </Stack>
          {busy && (
            <Typography variant="body2" color="text.secondary">
              {t("importMode.importing")}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

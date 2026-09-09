import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import { UnauthorizedError } from "../../api/client";
import { settingsApi, type PreviewMode } from "../../api/settings";
import SectionHeader from "../../components/SectionHeader";

type Props = {
  onUnauthorized?: () => void;
  onSaved?: (mode: PreviewMode) => void;
};

// Instance-wide, not per-user -- every browser hitting this API generates/serves previews
// against the same storage, so this is admin-configured like Storage Structure.
export default function PreviewsSection({ onUnauthorized, onSaved }: Props) {
  const { t } = useTranslation("app");
  const [mode, setMode] = React.useState<PreviewMode>("automatic");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const data = await settingsApi.getPreviews();
        if (active) setMode(data.mode);
      } catch (err) {
        if (err instanceof UnauthorizedError) onUnauthorized?.();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [onUnauthorized]);

  const selectMode = async (next: PreviewMode) => {
    if (next === mode || saving) return;
    const previous = mode;
    setMode(next);
    setSaving(true);
    setStatus(null);
    try {
      const data = await settingsApi.updatePreviews(next);
      onSaved?.(data.mode);
    } catch (err) {
      setMode(previous);
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
      } else {
        setStatus(err instanceof Error ? err.message : t("adminSettings.previews.failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ id: PreviewMode; label: string; description: string }> = [
    {
      id: "automatic",
      label: t("adminSettings.previews.automaticLabel"),
      description: t("adminSettings.previews.automaticDesc"),
    },
    {
      id: "on-demand",
      label: t("adminSettings.previews.onDemandLabel"),
      description: t("adminSettings.previews.onDemandDesc"),
    },
    {
      id: "disabled",
      label: t("adminSettings.previews.disabledLabel"),
      description: t("adminSettings.previews.disabledDesc"),
    },
  ];

  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("adminSettings.previews.heading")}
        subtitle={t("adminSettings.previews.subtitle")}
      />
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            <AlertTitle>{t("adminSettings.previews.infoTitle")}</AlertTitle>
            {t("adminSettings.previews.infoScope")}
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
              <li><Typography variant="body2">{t("adminSettings.previews.infoAutomatic")}</Typography></li>
              <li><Typography variant="body2">{t("adminSettings.previews.infoOnDemand")}</Typography></li>
              <li><Typography variant="body2">{t("adminSettings.previews.infoDisabled")}</Typography></li>
            </Box>
          </Alert>
          <RadioGroup value={mode} onChange={e => selectMode(e.target.value as PreviewMode)}>
            <Stack spacing={1.5}>
              {options.map(option => {
                const selected = mode === option.id;
                return (
                  <FormControlLabel
                    key={option.id}
                    value={option.id}
                    control={<Radio />}
                    disabled={loading || saving}
                    sx={{
                      alignItems: "flex-start",
                      m: 0,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: selected ? "primary.main" : "divider",
                      bgcolor: selected ? "action.selected" : "transparent",
                      p: 2,
                    }}
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{option.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                      </Box>
                    }
                  />
                );
              })}
            </Stack>
          </RadioGroup>
          {(saving || status) && (
            <Stack direction="row" alignItems="center" spacing={1}>
              {saving && <CircularProgress size={14} />}
              {status && <Typography variant="caption" color="text.secondary">{status}</Typography>}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

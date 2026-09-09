import React from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import { SLICER_OPTIONS } from "../../constants/settingsOptions";
import { UnauthorizedError } from "../../api/client";
import { settingsApi } from "../../api/settings";
import { setCachedSlicerPreference } from "../../hooks/useSlicerPreference";

type Props = {
  onUnauthorized?: () => void;
};

/** Stored server-side, not just locally -- used by the model menu's "Open in {Slicer}" action,
 *  which launches that slicer's own registered URL protocol (e.g. bambustudio://). */
export default function SlicerPicker({ onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    settingsApi.getSlicer()
      .then(res => {
        if (!active) return;
        setValue(res.slicer ?? "");
      })
      .catch(err => {
        if (active && err instanceof UnauthorizedError) onUnauthorized?.();
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onUnauthorized]);

  const handleChange = async (e: SelectChangeEvent) => {
    const next = e.target.value;
    const previous = value;
    setValue(next);
    setSaving(true);
    setStatus(null);
    try {
      const res = await settingsApi.updateSlicer(next || null);
      setValue(res.slicer ?? "");
      setCachedSlicerPreference(res.slicer ?? null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setValue(previous);
      setStatus(err instanceof Error ? err.message : t("profile.slicer.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600}>{t("profile.slicer.heading")}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t("profile.slicer.description")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" disabled={loading || saving} sx={{ minWidth: 220 }}>
            <InputLabel id="profile-slicer-select-label">{t("profile.slicer.label")}</InputLabel>
            <Select
              labelId="profile-slicer-select-label"
              label={t("profile.slicer.label")}
              value={value}
              onChange={handleChange}
            >
              {SLICER_OPTIONS.map(opt => (
                <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {saving && <CircularProgress size={16} />}
        </Stack>
        {value === "bambustudio" && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {t("profile.slicer.bridgeRequiredPrefix")}{" "}
            <Link component={RouterLink} to="/download">{t("profile.slicer.bridgeRequiredLink")}</Link>
          </Typography>
        )}
        {status && <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>{status}</Typography>}
      </Paper>
    </Box>
  );
}

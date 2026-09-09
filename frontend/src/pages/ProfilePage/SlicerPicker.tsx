import React from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import { SLICER_OPTIONS } from "../../constants/settingsOptions";
import { UnauthorizedError } from "../../api/client";
import { settingsApi } from "../../api/settings";

type Props = {
  onUnauthorized?: () => void;
};

/** Stored server-side, not just locally -- prep for a future "open this model in {slicer}"
 *  launch via that slicer's own registered URL protocol (e.g. bambustudio://). Not acted on
 *  anywhere yet; this is just where the preference is set. */
export default function SlicerPicker({ onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [value, setValue] = React.useState("");
  const [saved, setSaved] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    settingsApi.getSlicer()
      .then(res => {
        if (!active) return;
        setValue(res.slicer ?? "");
        setSaved(res.slicer ?? "");
      })
      .catch(err => {
        if (active && err instanceof UnauthorizedError) onUnauthorized?.();
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onUnauthorized]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await settingsApi.updateSlicer(value || null);
      setSaved(res.slicer ?? "");
      setStatus(t("profile.slicer.saved"));
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
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
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <FormControl size="small" disabled={loading || saving} sx={{ minWidth: 220 }}>
          <InputLabel id="profile-slicer-select-label">{t("profile.slicer.label")}</InputLabel>
          <Select
            labelId="profile-slicer-select-label"
            label={t("profile.slicer.label")}
            value={value}
            onChange={e => setValue(e.target.value)}
          >
            {SLICER_OPTIONS.map(opt => (
              <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" size="small" onClick={handleSave} disabled={loading || saving || value === saved}>
          {saving ? t("profile.saving") : t("common:save")}
        </Button>
        {saving && <CircularProgress size={16} />}
      </Stack>
      {status && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{status}</Typography>}
    </Box>
  );
}

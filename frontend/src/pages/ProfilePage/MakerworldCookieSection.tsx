import React from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import { UnauthorizedError } from "../../api/client";
import { settingsApi } from "../../api/settings";
import type { MakerWorldSettings } from "../../utils/settings";

type Props = {
  cookie: string;
  onUpdateMakerWorld: (patch: Partial<MakerWorldSettings>) => void;
  onUnauthorized?: () => void;
};

/** Required to import links/models from MakerWorld -- unlike the old always-open textarea
 *  (CookiePanel), this never displays the stored cookie itself: just a status chip plus
 *  add/edit/remove. Saves locally (still what every import request in this browser sends) and
 *  syncs to the backend so "connected" is a real, cross-device fact -- see
 *  services/makerworldCookieService.ts. */
export default function MakerworldCookieSection({ cookie, onUpdateMakerWorld, onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [configured, setConfigured] = React.useState(Boolean(cookie.trim()));
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    settingsApi.getMakerworld()
      .then(res => { if (active) setConfigured(res.configured); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const startEdit = () => {
    setDraft("");
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await settingsApi.updateMakerworld(draft.trim() || null);
      onUpdateMakerWorld({ cookie: draft });
      setConfigured(result.configured);
      setEditing(false);
      setDraft("");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error ? err.message : t("profile.makerworld.failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await settingsApi.updateMakerworld(null);
      onUpdateMakerWorld({ cookie: "" });
      setConfigured(result.configured);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error ? err.message : t("profile.makerworld.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600}>{t("profile.makerworld.heading")}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t("profile.makerworld.description")}
      </Typography>

      {editing ? (
        <Stack spacing={1.5}>
          <TextField
            multiline
            minRows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={t("profile.makerworld.placeholder") ?? undefined}
            disabled={saving}
            // Deliberate: focus the cookie field the moment editing starts.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={handleSave} disabled={saving || !draft.trim()}>
              {saving ? t("profile.saving") : t("common:save")}
            </Button>
            <Button size="small" onClick={cancelEdit} disabled={saving}>{t("common:cancel")}</Button>
          </Stack>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            label={configured ? t("profile.makerworld.added") : t("profile.makerworld.notAdded")}
            size="small"
            color={configured ? "success" : "default"}
            variant={configured ? "filled" : "outlined"}
          />
          <Button size="small" onClick={startEdit}>
            {configured ? t("common:edit") : t("profile.makerworld.add")}
          </Button>
          {configured && (
            <Button size="small" color="error" onClick={handleRemove} disabled={saving}>
              {t("common:remove")}
            </Button>
          )}
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
    </Box>
  );
}

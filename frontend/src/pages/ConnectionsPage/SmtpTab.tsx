import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { UnauthorizedError } from "../../api/client";
import { settingsApi, type SmtpSettings } from "../../api/settings";

type Props = {
  onUnauthorized?: () => void;
};

const EMPTY: SmtpSettings = { host: null, port: 587, secure: false, user: null, from: "", configured: false };

/** Instance-wide SMTP credentials used to send the account-verification email on registration
 *  (see backend's routes/auth.ts and mailer.ts). Leaving Host blank turns email verification off
 *  entirely -- new accounts are then verified and signed in immediately. */
export default function SmtpTab({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const [settings, setSettings] = React.useState<SmtpSettings>(EMPTY);
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await settingsApi.getSmtp());
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setError(t("adminSettings.smtp.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, t]);

  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const next = await settingsApi.updateSmtp({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        user: settings.user,
        from: settings.from,
        ...(password.trim() ? { pass: password.trim() } : {}),
      });
      setSettings(next);
      setPassword("");
      setStatus(t("adminSettings.smtp.saved"));
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setError(err instanceof Error ? err.message : t("adminSettings.smtp.failed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }

  const disabled = saving;

  return (
    <Stack spacing={3}>
      <Typography variant="caption" color="text.secondary">
        {t("adminSettings.smtp.helpText")}
      </Typography>

      <Alert severity={settings.configured ? "success" : "warning"}>
        {settings.configured ? t("adminSettings.smtp.statusConfigured") : t("adminSettings.smtp.statusNotConfigured")}
      </Alert>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          label={t("adminSettings.smtp.hostLabel")}
          value={settings.host ?? ""}
          onChange={e => setSettings(s => ({ ...s, host: e.target.value }))}
          placeholder={t("adminSettings.smtp.hostPlaceholder") ?? undefined}
          disabled={disabled}
          sx={{ flex: "2 1 260px" }}
        />
        <TextField
          type="number"
          label={t("adminSettings.smtp.portLabel")}
          value={settings.port}
          onChange={e => setSettings(s => ({ ...s, port: Number(e.target.value) || s.port }))}
          disabled={disabled}
          sx={{ flex: "1 1 120px" }}
        />
      </Stack>

      <FormControlLabel
        control={
          <Switch
            checked={settings.secure}
            onChange={e => setSettings(s => ({ ...s, secure: e.target.checked }))}
            disabled={disabled}
          />
        }
        label={
          <Box>
            <Typography variant="body2">{t("adminSettings.smtp.secureLabel")}</Typography>
            <Typography variant="caption" color="text.secondary">{t("adminSettings.smtp.secureHint")}</Typography>
          </Box>
        }
      />

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          label={t("adminSettings.smtp.userLabel")}
          value={settings.user ?? ""}
          onChange={e => setSettings(s => ({ ...s, user: e.target.value }))}
          disabled={disabled}
          autoComplete="off"
          sx={{ flex: "1 1 220px" }}
        />
        <TextField
          type="password"
          label={t("adminSettings.smtp.passwordLabel")}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={t("adminSettings.smtp.passwordPlaceholder") ?? undefined}
          disabled={disabled}
          autoComplete="new-password"
          sx={{ flex: "1 1 220px" }}
        />
      </Stack>

      <TextField
        label={t("adminSettings.smtp.fromLabel")}
        value={settings.from}
        onChange={e => setSettings(s => ({ ...s, from: e.target.value }))}
        placeholder={t("adminSettings.smtp.fromPlaceholder") ?? undefined}
        disabled={disabled}
        fullWidth
      />

      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <Button variant="contained" onClick={save} disabled={disabled}>
          {saving ? t("adminSettings.smtp.saving") : t("adminSettings.smtp.save")}
        </Button>
        {saving && <CircularProgress size={14} />}
        {status && <Typography variant="caption" color="text.secondary">{status}</Typography>}
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    </Stack>
  );
}

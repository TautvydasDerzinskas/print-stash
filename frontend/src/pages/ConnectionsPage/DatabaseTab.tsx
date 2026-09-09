import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import { UnauthorizedError } from "../../api/client";
import { settingsApi, type DatabaseInfo } from "../../api/settings";

type Props = {
  onUnauthorized?: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{value}</Typography>
    </Stack>
  );
}

/** Host/port always reflect the live DATABASE_URL this process was started with -- not editable
 *  here, since reaching a different server means changing that env var and restarting. Database/
 *  user/password can be switched live: "Test & Save" connects with the candidate credentials and
 *  runs a sanity query before applying anything, so a typo can't take the app down. The switch
 *  only affects this running process -- it does not survive a restart (see backend's
 *  databaseSettingsService.ts for why). */
export default function DatabaseTab({ onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [info, setInfo] = React.useState<DatabaseInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [database, setDatabase] = React.useState("");
  const [user, setUser] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getDatabase();
      setInfo(data);
      setDatabase(data.database ?? "");
      setUser(data.user ?? "");
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setLoadError(t("adminSettings.database.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, t]);

  React.useEffect(() => { void load(); }, [load]);

  const confirmSwitch = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const next = await settingsApi.testAndSaveDatabase({ database: database.trim(), user: user.trim(), password });
      setInfo(next);
      setPassword("");
      setStatus(t("adminSettings.database.saved"));
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setError(err instanceof Error ? err.message : t("adminSettings.database.failed"));
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

  if (loadError || !info) {
    return <Alert severity="error">{loadError || t("adminSettings.database.loadFailed")}</Alert>;
  }

  const unset = t("adminSettings.database.unset");
  const isDirty = database.trim() !== (info.database ?? "") || user.trim() !== (info.user ?? "") || password.trim() !== "";

  return (
    <Stack spacing={3}>
      <Typography variant="caption" color="text.secondary">
        {t("adminSettings.database.helpText")}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack spacing={1.5}>
            <Row label={t("adminSettings.database.hostLabel")} value={info.host ?? unset} />
            <Row label={t("adminSettings.database.portLabel")} value={info.port ? String(info.port) : unset} />
          </Stack>

          <TextField
            label={t("adminSettings.database.nameLabel")}
            value={database}
            onChange={e => setDatabase(e.target.value)}
            disabled={saving}
            fullWidth
          />
          <TextField
            label={t("adminSettings.database.userLabel")}
            value={user}
            onChange={e => setUser(e.target.value)}
            disabled={saving}
            fullWidth
            autoComplete="off"
          />
          <TextField
            type="password"
            label={t("adminSettings.database.passwordLabel")}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t("adminSettings.database.passwordPlaceholder") ?? undefined}
            disabled={saving}
            fullWidth
            autoComplete="new-password"
          />

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Button
              variant="contained"
              onClick={() => setConfirmOpen(true)}
              disabled={saving || !isDirty || !database.trim() || !user.trim() || !password.trim()}
            >
              {saving ? t("adminSettings.database.saving") : t("adminSettings.database.testAndSave")}
            </Button>
            {saving && <CircularProgress size={14} />}
            {status && <Typography variant="caption" color="text.secondary">{status}</Typography>}
          </Stack>

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        </Stack>
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("adminSettings.database.confirmTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Alert severity="warning">{t("adminSettings.database.confirmWarning")}</Alert>
            <DialogContentText>
              {t("adminSettings.database.confirmBody", { database: database.trim(), user: user.trim() })}
            </DialogContentText>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t("common:cancel")}</Button>
          <Button variant="contained" color="warning" onClick={confirmSwitch}>
            {t("adminSettings.database.testAndSave")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

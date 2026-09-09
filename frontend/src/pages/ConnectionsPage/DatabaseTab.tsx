import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
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

/** Read-only: this always reflects the DATABASE_URL environment variable the backend process was
 *  actually started with -- there's no admin-editable override, since switching databases means
 *  restarting the process against a different env var, not something safe to do from a running
 *  app talking to the database it would be switching away from. The password is never sent to
 *  the frontend at all, not even masked. */
export default function DatabaseTab({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const [info, setInfo] = React.useState<DatabaseInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const data = await settingsApi.getDatabase();
        if (active) setInfo(data);
      } catch (err) {
        if (!active) return;
        if (err instanceof UnauthorizedError) onUnauthorized?.();
        else setError(t("adminSettings.database.loadFailed"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [onUnauthorized, t]);

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }

  if (error || !info) {
    return <Alert severity="error">{error || t("adminSettings.database.loadFailed")}</Alert>;
  }

  const unset = t("adminSettings.database.unset");

  return (
    <Stack spacing={3}>
      <Typography variant="caption" color="text.secondary">
        {t("adminSettings.database.helpText")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Row label={t("adminSettings.database.providerLabel")} value={info.provider} />
          <Row label={t("adminSettings.database.hostLabel")} value={info.host ?? unset} />
          <Row label={t("adminSettings.database.portLabel")} value={info.port ? String(info.port) : unset} />
          <Row label={t("adminSettings.database.nameLabel")} value={info.database ?? unset} />
          <Row label={t("adminSettings.database.userLabel")} value={info.user ?? unset} />
        </Stack>
      </Paper>
    </Stack>
  );
}

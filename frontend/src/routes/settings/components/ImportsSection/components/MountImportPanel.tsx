import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Button from "@mui/material/Button";
import { UnauthorizedError, getMountImportSettings, updateMountImportSettings } from "../../../../../services/api";

type Props = {
  onUnauthorized?: () => void;
};

/** Server-side "index files already on the mounted volume" import settings -- fetched and
 *  saved independently of the rest of AppSettings, since they live on the server, not
 *  localStorage. */
export default function MountImportPanel({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const [mountEnabled, setMountEnabled] = React.useState(false);
  const [mountCopyFiles, setMountCopyFiles] = React.useState(true);
  const [mountPath, setMountPath] = React.useState<string | null>(null);
  const [mountLoading, setMountLoading] = React.useState(false);
  const [mountSaving, setMountSaving] = React.useState(false);
  const [mountInitial, setMountInitial] = React.useState({ enabled: false, copy: true });

  React.useEffect(() => {
    let active = true;
    setMountLoading(true);
    void (async () => {
      try {
        const data = await getMountImportSettings();
        if (!active) return;
        setMountEnabled(Boolean(data.enabled));
        setMountCopyFiles(Boolean(data.copy_files));
        setMountPath(data.path || null);
        setMountInitial({ enabled: Boolean(data.enabled), copy: Boolean(data.copy_files) });
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized?.();
        } else {
          console.error(err);
        }
      } finally {
        if (active) setMountLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [onUnauthorized]);

  const mountDirty = mountEnabled !== mountInitial.enabled || mountCopyFiles !== mountInitial.copy;

  const saveMountSettings = async () => {
    setMountSaving(true);
    try {
      const data = await updateMountImportSettings({
        enabled: mountEnabled,
        copy_files: mountCopyFiles,
      });
      setMountEnabled(Boolean(data.enabled));
      setMountCopyFiles(Boolean(data.copy_files));
      setMountPath(data.path || null);
      setMountInitial({ enabled: Boolean(data.enabled), copy: Boolean(data.copy_files) });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
      } else {
        console.error(err);
      }
    } finally {
      setMountSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>{t("settings.imports.mountHeading")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("settings.imports.mountDesc")}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t("settings.imports.mountPath", { path: mountPath || t("settings.imports.mountPathNotConfigured") })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("settings.imports.mountNote")}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={mountEnabled}
              onChange={e => setMountEnabled(e.target.checked)}
              disabled={mountLoading || mountSaving}
            />
          }
          label={t("settings.imports.mountEnableLabel")}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={mountCopyFiles}
              onChange={e => setMountCopyFiles(e.target.checked)}
              disabled={mountLoading || mountSaving}
            />
          }
          label={t("settings.imports.mountCopyLabel")}
        />
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
          <Button
            size="small"
            variant="outlined"
            disabled={!mountDirty || mountLoading || mountSaving}
            onClick={saveMountSettings}
          >
            {mountSaving ? t("settings.imports.saving") : t("settings.imports.save")}
          </Button>
          {mountLoading && (
            <Typography variant="caption" color="text.secondary">{t("settings.imports.loadingSettings")}</Typography>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

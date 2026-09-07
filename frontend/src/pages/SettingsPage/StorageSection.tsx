import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { UnauthorizedError } from "../../api/client";
import { settingsApi } from "../../api/settings";
import SectionHeader from "./SectionHeader";

type Props = {
  onUnauthorized?: () => void;
  onBack: () => void;
};

// Two example plates of the same print, to show that sibling plates
// share the {model} directory under the default template.
const PLATE_PREVIEW_VALUES: Record<string, string>[] = [
  {
    folder: "Props/Workshop",
    collection: "Tabletop",
    tags: "Print in place + Useful",
    creator: "Example creator",
    model: "Cable clip",
    name: "Cable clip",
    filename: "Cable clip.3mf",
    id: "a1b2c3d4",
    plate: "1",
  },
  {
    folder: "Props/Workshop",
    collection: "Tabletop",
    tags: "Print in place + Useful",
    creator: "Example creator",
    model: "Cable clip",
    name: "Cable clip",
    filename: "Cable clip-2.3mf",
    id: "a1b2c3d4",
    plate: "2",
  },
];

const DEFAULT_TEMPLATE = "{folder}/{model}/{filename}";

export default function StorageSection({ onUnauthorized, onBack }: Props) {
  const { t } = useTranslation("app");
  const [storageTemplate, setStorageTemplate] = React.useState(DEFAULT_TEMPLATE);
  const [storageInitial, setStorageInitial] = React.useState(DEFAULT_TEMPLATE);
  const [storageTokens, setStorageTokens] = React.useState<string[]>([]);
  const [storagePlatePaths, setStoragePlatePaths] = React.useState<string[]>([]);
  const [storageApplyExisting, setStorageApplyExisting] = React.useState(false);
  const [storageLoading, setStorageLoading] = React.useState(false);
  const [storageSaving, setStorageSaving] = React.useState(false);
  const [storageStatus, setStorageStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setStorageLoading(true);
    setStorageStatus(null);
    void (async () => {
      try {
        const data = await settingsApi.getStorage();
        if (!active) return;
        setStorageTemplate(data.template);
        setStorageInitial(data.template);
        setStorageTokens(data.allowed_tokens || []);
        setStoragePlatePaths(data.plate_paths || []);
      } catch (err) {
        if (err instanceof UnauthorizedError) onUnauthorized?.();
        else setStorageStatus(t("settings.storage.failed"));
      } finally {
        if (active) setStorageLoading(false);
      }
    })();
    return () => { active = false; };
  }, [onUnauthorized, t]);

  const saveStorageSettings = async () => {
    setStorageSaving(true);
    setStorageStatus(null);
    try {
      const data = await settingsApi.updateStorage({
        template: storageTemplate,
        apply_existing: storageApplyExisting,
      });
      setStorageTemplate(data.template);
      setStorageInitial(data.template);
      setStorageTokens(data.allowed_tokens || []);
      setStoragePlatePaths(data.plate_paths || []);
      setStorageApplyExisting(false);
      setStorageStatus(
        storageApplyExisting
          ? t("settings.storage.savedApplied", {
              moved: data.moved,
              skippedSuffix: data.skipped ? t("settings.storage.skippedSuffix", { skipped: data.skipped }) : "",
            })
          : t("settings.storage.savedNoApply")
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
      } else {
        setStorageStatus(err instanceof Error ? err.message : t("settings.storage.failed"));
      }
    } finally {
      setStorageSaving(false);
    }
  };

  const isDirty = storageTemplate.trim() !== storageInitial;
  const templateTrimmed = storageTemplate.trim();
  const draftSamples = templateTrimmed
    ? PLATE_PREVIEW_VALUES.map(values =>
        Object.entries(values).reduce(
          (value, [token, replacement]) => value.split(`{${token}}`).join(replacement),
          templateTrimmed
        )
      )
    : [];
  const examplePaths = draftSamples.length ? draftSamples : storagePlatePaths;

  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.storage.heading")}
        subtitle={t("settings.storage.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>{t("settings.storage.templateHeading")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("settings.storage.templateDesc")}
            </Typography>
          </Box>
          <TextField
            size="small"
            label={t("settings.storage.templateLabel")}
            value={storageTemplate}
            onChange={e => { setStorageTemplate(e.target.value); setStorageStatus(null); }}
            placeholder={t("settings.storage.templatePlaceholder") ?? undefined}
            disabled={storageLoading || storageSaving}
            InputProps={{ sx: { fontFamily: "monospace" } }}
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {storageTokens.map(token => (
              <Button
                key={token}
                size="small"
                variant="outlined"
                sx={{ fontFamily: "monospace", textTransform: "none" }}
                onClick={() => setStorageTemplate(value => {
                  const tokenText = `{${token}}`;
                  if (token === "filename" && value.includes(tokenText)) return value;
                  const filenameSuffix = "/{filename}";
                  if (value.endsWith(filenameSuffix)) {
                    return `${value.slice(0, -filenameSuffix.length)}/${tokenText}${filenameSuffix}`;
                  }
                  return `${value}${value.endsWith("/") || !value ? "" : "/"}${tokenText}`;
                })}
              >
                {`{${token}}`}
              </Button>
            ))}
          </Stack>
          <Paper variant="outlined" sx={{ p: 1.5, borderStyle: "dashed" }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
              {t("settings.storage.examplePathsHeading")}
            </Typography>
            {examplePaths.length ? (
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {examplePaths.map(path => (
                  <Typography key={path} variant="caption" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                    {path}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <Typography variant="caption" sx={{ fontFamily: "monospace", display: "block", mt: 0.5 }}>
                {t("settings.storage.examplePathsEmpty")}
              </Typography>
            )}
          </Paper>
          <FormControlLabel
            sx={{ alignItems: "flex-start", m: 0 }}
            control={
              <Checkbox
                sx={{ mt: -0.5 }}
                checked={storageApplyExisting}
                onChange={e => setStorageApplyExisting(e.target.checked)}
                disabled={storageLoading || storageSaving}
              />
            }
            label={
              <Box>
                <Typography variant="body2">{t("settings.storage.reorganizeLabel")}</Typography>
                <Typography variant="caption" color="text.secondary">{t("settings.storage.reorganizeHint")}</Typography>
              </Box>
            }
          />
          <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
            <Button
              variant="contained"
              disabled={storageLoading || storageSaving || (!isDirty && !storageApplyExisting)}
              onClick={saveStorageSettings}
            >
              {storageSaving ? t("settings.storage.saving") : t("settings.storage.save")}
            </Button>
            {storageStatus && (
              <Typography variant="caption" color="text.secondary">{storageStatus}</Typography>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

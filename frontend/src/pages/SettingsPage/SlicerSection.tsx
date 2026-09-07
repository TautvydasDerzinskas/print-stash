import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import { SLICER_OPTIONS } from "../../constants/settingsOptions";
import type { SlicerSettings } from "../../utils/settings";
import SectionHeader from "./SectionHeader";

type Props = {
  slicer: SlicerSettings;
  onUpdate: (patch: Partial<SlicerSettings>) => void;
  onBack: () => void;
};

export default function SlicerSection({ slicer, onUpdate, onBack }: Props) {
  const { t } = useTranslation("app");
  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.slicer.heading")}
        subtitle={t("settings.slicer.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            {t("settings.slicer.helperPrefix")}{" "}
            <Link
              href="https://github.com/PrintStash/PrintStash/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              {t("settings.slicer.helperLinkText")}
            </Link>
            {t("settings.slicer.helperSuffix")}
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={slicer.enabled}
                onChange={e => onUpdate({ enabled: e.target.checked })}
              />
            }
            label={t("settings.slicer.enableLabel")}
          />

          <FormControl size="small" disabled={!slicer.enabled} sx={{ maxWidth: 320 }}>
            <InputLabel id="slicer-select-label">{t("settings.slicer.preferredLabel")}</InputLabel>
            <Select
              labelId="slicer-select-label"
              label={t("settings.slicer.preferredLabel")}
              value={slicer.selected}
              onChange={e => onUpdate({ selected: e.target.value as string })}
            >
              {SLICER_OPTIONS.map(opt => (
                <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="caption" color="text.secondary">
            {t("settings.slicer.footerNote")}
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}

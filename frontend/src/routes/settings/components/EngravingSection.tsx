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
import { ENGRAVER_OPTIONS } from "../../../constants/settingsOptions";
import type { EngravingSettings } from "../../../services/settings";
import SectionHeader from "./SectionHeader";

type Props = {
  engraving: EngravingSettings;
  onUpdate: (patch: Partial<EngravingSettings>) => void;
  onBack: () => void;
};

export default function EngravingSection({ engraving, onUpdate, onBack }: Props) {
  const { t } = useTranslation("app");
  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.engraving.heading")}
        subtitle={t("settings.engraving.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            {t("settings.engraving.helperPrefix")}{" "}
            <Link
              href="https://github.com/PrintStash/PrintStash/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              {t("settings.engraving.helperLinkText")}
            </Link>
            {t("settings.engraving.helperSuffix")}
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={engraving.enabled}
                onChange={e => onUpdate({ enabled: e.target.checked })}
              />
            }
            label={t("settings.engraving.enableLabel")}
          />

          <FormControl size="small" disabled={!engraving.enabled} sx={{ maxWidth: 320 }}>
            <InputLabel id="engraver-select-label">{t("settings.engraving.preferredLabel")}</InputLabel>
            <Select
              labelId="engraver-select-label"
              label={t("settings.engraving.preferredLabel")}
              value={engraving.selected}
              onChange={e => onUpdate({ selected: e.target.value as string })}
            >
              {ENGRAVER_OPTIONS.map(opt => (
                <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="caption" color="text.secondary">
            {t("settings.engraving.footerNote")}
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}

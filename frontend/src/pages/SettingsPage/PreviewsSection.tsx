import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { PreviewMode } from "../../utils/settings";
import SectionHeader from "./SectionHeader";

type Props = {
  mode: PreviewMode;
  onSelect: (mode: PreviewMode) => void;
  onBack: () => void;
};

export default function PreviewsSection({ mode, onSelect, onBack }: Props) {
  const { t } = useTranslation("app");
  const options: Array<{ id: PreviewMode; label: string; description: string }> = [
    {
      id: "automatic",
      label: t("settings.previews.automaticLabel"),
      description: t("settings.previews.automaticDesc"),
    },
    {
      id: "on-demand",
      label: t("settings.previews.onDemandLabel"),
      description: t("settings.previews.onDemandDesc"),
    },
    {
      id: "disabled",
      label: t("settings.previews.disabledLabel"),
      description: t("settings.previews.disabledDesc"),
    },
  ];
  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.previews.heading")}
        subtitle={t("settings.previews.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />
      <RadioGroup value={mode} onChange={e => onSelect(e.target.value as PreviewMode)}>
        <Stack spacing={1.5}>
          {options.map(option => {
            const selected = mode === option.id;
            return (
              <FormControlLabel
                key={option.id}
                value={option.id}
                control={<Radio />}
                sx={{
                  alignItems: "flex-start",
                  m: 0,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: selected ? "primary.main" : "divider",
                  bgcolor: selected ? "action.selected" : "transparent",
                  p: 2,
                }}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{option.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                  </Box>
                }
              />
            );
          })}
        </Stack>
      </RadioGroup>
      <Typography variant="caption" color="text.secondary">
        {t("settings.previews.footerNote")}
      </Typography>
    </Stack>
  );
}

import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import { THEME_OPTIONS, type ThemeSelection } from "../../constants/settingsOptions";
import { THEME_SWATCHES } from "../../constants/themeSwatches";
import SectionHeader from "./SectionHeader";

type Props = {
  selected: ThemeSelection;
  onSelect: (id: ThemeSelection) => void;
  onBack: () => void;
};

export default function ThemeSection({ selected: selectedTheme, onSelect, onBack }: Props) {
  const { t } = useTranslation("app");
  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.theme.heading")}
        subtitle={t("settings.theme.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <RadioGroup
          value={selectedTheme}
          onChange={e => onSelect(e.target.value as ThemeSelection)}
        >
          <Stack spacing={1.5}>
            {THEME_OPTIONS.map(option => {
              const selected = selectedTheme === option.id;
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
                    p: 1.5,
                  }}
                  label={
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box
                        aria-hidden="true"
                        sx={{
                          mt: 0.25,
                          height: 32,
                          width: 32,
                          flexShrink: 0,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: selected ? "primary.main" : "divider",
                          backgroundImage: THEME_SWATCHES[option.id],
                        }}
                      />
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{option.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                      </Box>
                    </Stack>
                  }
                />
              );
            })}
          </Stack>
        </RadioGroup>
      </Paper>
    </Stack>
  );
}

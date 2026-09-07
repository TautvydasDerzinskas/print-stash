import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import ButtonBase from "@mui/material/ButtonBase";
import CheckIcon from "@mui/icons-material/Check";
import { SUPPORTED_LANGUAGES } from "../../constants/languages";
import SectionHeader from "./SectionHeader";

type Props = {
  onBack: () => void;
};

export default function LanguageSection({ onBack }: Props) {
  const { t, i18n } = useTranslation("app");
  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.language.heading")}
        subtitle={t("settings.language.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          {SUPPORTED_LANGUAGES.map(lang => {
            const selected = (i18n.resolvedLanguage || i18n.language || "").startsWith(lang.code);
            return (
              <ButtonBase
                key={lang.code}
                onClick={() => { void i18n.changeLanguage(lang.code); }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "left",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: selected ? "primary.main" : "divider",
                  bgcolor: selected ? "action.selected" : "transparent",
                  p: 1.5,
                }}
              >
                <Typography variant="body2" fontWeight={selected ? 600 : 400}>
                  {lang.label}
                </Typography>
                {selected && <CheckIcon fontSize="small" color="primary" />}
              </ButtonBase>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}

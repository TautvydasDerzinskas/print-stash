import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { NetworkSettings } from "../../../services/settings";
import SectionHeader from "./SectionHeader";

type Props = {
  publicUrl: string;
  onUpdate: (patch: Partial<NetworkSettings>) => void;
  onBack: () => void;
};

export default function NetworkSection({ publicUrl, onUpdate, onBack }: Props) {
  const { t } = useTranslation("app");
  const [networkDraft, setNetworkDraft] = React.useState(publicUrl);

  React.useEffect(() => {
    setNetworkDraft(publicUrl || "");
  }, [publicUrl]);

  const trimmedUrl = (networkDraft || "").trim().replace(/\/+$/, "");
  const apiPreview = trimmedUrl || t("settings.network.apiBaseAuto");
  const isDirty = trimmedUrl !== (publicUrl || "");

  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.network.heading")}
        subtitle={t("settings.network.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>{t("settings.network.publicUrlHeading")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("settings.network.publicUrlDesc")}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {t("settings.network.storedNote")}
          </Typography>
          <TextField
            size="small"
            label={t("settings.network.urlLabel")}
            value={networkDraft}
            onChange={e => setNetworkDraft(e.target.value)}
            placeholder={t("settings.network.urlPlaceholder") ?? undefined}
            sx={{ maxWidth: 420 }}
          />
          <Typography variant="caption" color="text.secondary">
            {t("settings.network.apiBase", { url: apiPreview })}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              size="small"
              variant="outlined"
              disabled={!isDirty}
              onClick={() => {
                const next = trimmedUrl;
                onUpdate({ publicUrl: next });
                setNetworkDraft(next);
              }}
            >
              {t("settings.network.save")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!publicUrl}
              onClick={() => {
                onUpdate({ publicUrl: "" });
                setNetworkDraft("");
              }}
            >
              {t("settings.network.clear")}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

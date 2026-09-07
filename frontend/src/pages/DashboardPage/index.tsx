import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";

// The new default landing page. Empty for now -- dashboard panels (recent prints, storage
// usage, import activity, etc.) come in a follow-up; this just gives the route somewhere to go.
export default function DashboardPage() {
  const { t } = useTranslation("app");
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 10, color: "text.secondary" }}>
      <SpaceDashboardIcon sx={{ fontSize: 40 }} />
      <Typography variant="body2">{t("dashboard.comingSoon")}</Typography>
    </Stack>
  );
}

import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Chip from "@mui/material/Chip";
import PublicIcon from "@mui/icons-material/Public";
import { printProviderInfo } from "../../constants/importProviders";
import type { DashboardProvider } from "../../api/dashboard";

type Props = {
  providers: DashboardProvider[];
};

/** Top Providers -- how many of this user's models came from each source (MakerWorld,
 *  Thingiverse, or a direct Thingport upload). A fixed, small set in practice, so unlike the
 *  other list cards this one has no "see more" dialog and its rows aren't clickable -- there's
 *  no per-provider filtered view to link to yet. */
export default function ProviderListCard({ providers }: Props) {
  const { t } = useTranslation("app");

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, display: "flex", flexDirection: "column", borderColor: (theme) => (theme.palette.mode === "dark" ? "transparent" : "divider") }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, color: "primary.main" }}>
        <PublicIcon />
        <Typography variant="h6" fontWeight={700} sx={{ color: (theme) => theme.thingport.headingText }}>{t("dashboard.topProviders.title")}</Typography>
      </Box>

      {providers.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t("dashboard.topProviders.empty")}</Typography>
      ) : (
        <List dense disablePadding>
          {providers.map((p) => {
            const info = printProviderInfo(p.provider);
            return (
              <ListItem key={p.provider} sx={{ px: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
                  <Chip
                    label={info.label}
                    size="small"
                    sx={{ bgcolor: info.color, color: info.textColor ?? "#fff", fontWeight: 600 }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                    {t("dashboard.topProviders.modelCount", { count: p.model_count })}
                  </Typography>
                </Stack>
              </ListItem>
            );
          })}
        </List>
      )}
    </Paper>
  );
}

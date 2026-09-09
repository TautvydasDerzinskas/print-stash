import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import PublicIcon from "@mui/icons-material/Public";
import type { DashboardProvider } from "../../api/dashboard";

type Props = {
  providers: DashboardProvider[];
};

const PROVIDER_LABELS: Record<string, string> = {
  makerworld: "MakerWorld",
  thingiverse: "Thingiverse",
  printstash: "PrintStash",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Top Providers -- how many of this user's models came from each source (MakerWorld,
 *  Thingiverse, or a direct PrintStash upload). A fixed, small set in practice, so unlike the
 *  other list cards this one has no "see more" dialog and its rows aren't clickable -- there's
 *  no per-provider filtered view to link to yet. */
export default function ProviderListCard({ providers }: Props) {
  const { t } = useTranslation("app");

  return (
    <Paper variant="outlined" sx={{ p: 2.5, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, color: "primary.main" }}>
        <PublicIcon />
        <Typography variant="h6" fontWeight={700} color="text.primary">{t("dashboard.topProviders.title")}</Typography>
      </Box>

      {providers.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t("dashboard.topProviders.empty")}</Typography>
      ) : (
        <List dense disablePadding>
          {providers.map((p) => (
            <ListItem key={p.provider} sx={{ px: 1 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <PublicIcon fontSize="small" color="disabled" />
              </ListItemIcon>
              <ListItemText primary={providerLabel(p.provider)} />
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                {t("dashboard.topProviders.modelCount", { count: p.model_count })}
              </Typography>
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}

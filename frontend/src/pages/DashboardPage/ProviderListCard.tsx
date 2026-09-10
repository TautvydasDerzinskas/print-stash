import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Chip from "@mui/material/Chip";
import PublicIcon from "@mui/icons-material/Public";
import { IMPORT_PROVIDER_INFO } from "../../constants/importProviders";
import type { DashboardProvider } from "../../api/dashboard";

type Props = {
  providers: DashboardProvider[];
};

const OWN_UPLOAD_LABEL = "Thingport";

// Reuses the exact same brand colors as the provider badge shown on a model's card thumbnail
// (see constants/importProviders.ts) -- a direct upload/zip import has no import-source badge
// there (sourceProvider is null), so it falls back to the app's own primary color here instead
// of a fixed brand hex.
function chipSx(provider: string): { label: string; sx: object } {
  const info = IMPORT_PROVIDER_INFO[provider];
  if (info) return { label: info.label, sx: { bgcolor: info.color, color: "#fff", fontWeight: 600 } };
  return { label: OWN_UPLOAD_LABEL, sx: { bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 600 } };
}

/** Top Providers -- how many of this user's models came from each source (MakerWorld,
 *  Thingiverse, or a direct Thingport upload). A fixed, small set in practice, so unlike the
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
          {providers.map((p) => {
            const { label, sx } = chipSx(p.provider);
            return (
              <ListItem key={p.provider} sx={{ px: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
                  <Chip label={label} size="small" sx={sx} />
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

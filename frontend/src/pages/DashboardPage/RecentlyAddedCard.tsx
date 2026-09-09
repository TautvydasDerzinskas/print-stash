import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@mui/material/Avatar";
import NewReleasesIcon from "@mui/icons-material/NewReleases";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import { printsApi } from "../../api/prints";
import type { DashboardModel } from "../../api/dashboard";

type Props = {
  models: DashboardModel[];
};

// Same relative-time formatting as NotificationBell.tsx (kept local rather than shared since
// it's a 6-line function) -- reuses its i18n keys since the phrasing isn't notification-specific.
function relativeTime(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return t("notifications.justNow");
  if (minutes < 60) return t("notifications.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("notifications.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return t("notifications.daysAgo", { count: days });
}

/** Recently added models -- full-width, bottom of the dashboard. No "see more": this card only
 *  ever shows a fixed handful (see backend's dashboardService.ts), same as
 *  youtube-mp3-vault's RecentlyAddedCard. */
export default function RecentlyAddedCard({ models }: Props) {
  const { t } = useTranslation("app");
  const navigate = useNavigate();

  return (
    <Paper variant="outlined" sx={{ p: 2.5, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, color: "primary.main" }}>
        <NewReleasesIcon />
        <Typography variant="h6" fontWeight={700} color="text.primary">{t("dashboard.recentlyAdded.title")}</Typography>
      </Box>

      {models.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t("dashboard.recentlyAdded.empty")}</Typography>
      ) : (
        <List dense disablePadding>
          {models.map((model) => (
            <ListItemButton key={model.id} onClick={() => navigate(`/models/${model.id}`)} sx={{ borderRadius: 1, px: 1 }}>
              <ListItemAvatar sx={{ minWidth: 48 }}>
                <Avatar src={model.thumb_url ? printsApi.fileUrl(model.thumb_url) : undefined} variant="rounded" sx={{ width: 40, height: 40 }}>
                  <ViewInArIcon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={model.name} primaryTypographyProps={{ noWrap: true }} />
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                {relativeTime(model.created_at, t)}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      )}
    </Paper>
  );
}

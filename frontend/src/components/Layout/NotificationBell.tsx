import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import IconButton from "@mui/material/IconButton";
import Badge from "@mui/material/Badge";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import NotificationsIcon from "@mui/icons-material/Notifications";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useNotifications } from "./NotificationsContext";
import type { Notification } from "../../api/notifications";

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

export default function NotificationBell() {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const { items, unreadCount, markAllRead } = useNotifications();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
    if (unreadCount > 0) void markAllRead();
  };

  const handleClose = () => setAnchorEl(null);

  const handleItemClick = (notification: Notification) => {
    handleClose();
    if (notification.internal_path) navigate(notification.internal_path);
  };

  return (
    <>
      <Tooltip title={t("notifications.label")}>
        <IconButton size="small" onClick={handleOpen}>
          <Badge badgeContent={unreadCount} color="error" max={99}>
            <NotificationsIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 420 } } }}
      >
        {items.length === 0 && (
          <Stack alignItems="center" spacing={0.5} sx={{ py: 3, color: "text.secondary" }}>
            <Typography variant="body2">{t("notifications.empty")}</Typography>
          </Stack>
        )}
        {items.map((notification, idx) => (
          <div key={notification.id}>
            {idx > 0 && <Divider />}
            <MenuItem
              onClick={() => handleItemClick(notification)}
              sx={{ whiteSpace: "normal", alignItems: "flex-start", py: 1 }}
            >
              <Stack spacing={0.25} sx={{ minWidth: 0, width: "100%" }}>
                <Typography variant="body2" fontWeight={notification.read ? 400 : 700}>
                  {notification.title}
                </Typography>
                {notification.body && (
                  <Typography variant="caption" color="text.secondary">
                    {notification.body}
                  </Typography>
                )}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.25 }}>
                  <Typography variant="caption" color="text.disabled">
                    {relativeTime(notification.created_at, t)}
                  </Typography>
                  {notification.external_url && (
                    <Link
                      href={notification.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, fontSize: 12 }}
                    >
                      {t("notifications.viewSource")}
                      <OpenInNewIcon sx={{ fontSize: 12 }} />
                    </Link>
                  )}
                </Stack>
              </Stack>
            </MenuItem>
          </div>
        ))}
      </Menu>
    </>
  );
}

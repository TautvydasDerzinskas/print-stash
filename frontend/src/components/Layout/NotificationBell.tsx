import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useTranslation } from "react-i18next";

/** Placeholder for the app-wide notification center -- there's nothing to notify about yet,
 *  so this is just the bell with no menu behind it. */
export default function NotificationBell() {
  const { t } = useTranslation("app");
  return (
    <Tooltip title={t("notifications.label")}>
      <span>
        <IconButton size="small" disabled>
          <NotificationsIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}

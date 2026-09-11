import React from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { AuthUser } from "../../api/auth";
import type { ThemeSelection } from "../../constants/settingsOptions";
import AddMenu from "./AddMenu";
import NotificationBell from "./NotificationBell";
import { UserMenu } from "./UserMenu";

type Props = {
  title: string;
  onBack?: () => void;
  /** Slot for page-specific actions next to the title (an overflow "more" menu, etc.) --
   *  nothing currently populates it, but the header supports it the same way it will once a
   *  page needs one. */
  actions?: React.ReactNode;
  folderId: string | null;
  makerworldCookie: string;
  onUploaded: () => void;
  onUnauthorized?: () => void;
  user: AuthUser | null;
  theme: ThemeSelection;
  onThemeChange: (theme: ThemeSelection) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
};

/** The persistent header row above the active view's content: an optional back button + title
 *  (+ page actions) on the left, and the global Add/Notifications/User cluster on the right. */
export default function TopBar({
  title,
  onBack,
  actions,
  folderId,
  makerworldCookie,
  onUploaded,
  onUnauthorized,
  user,
  theme,
  onThemeChange,
  onOpenProfile,
  onLogout,
}: Props) {
  const { t } = useTranslation("app");
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} minWidth={0}>
        {onBack && (
          <Tooltip title={t("shell.backToLibrary")}>
            <IconButton size="small" onClick={onBack}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Typography variant="h6" fontWeight={700} noWrap>{title}</Typography>
        {actions}
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1}>
        <AddMenu
          folderId={folderId}
          makerworldCookie={makerworldCookie}
          onUploaded={onUploaded}
          onUnauthorized={onUnauthorized}
        />
        <NotificationBell />
        <UserMenu
          user={user}
          theme={theme}
          onThemeChange={onThemeChange}
          onOpenProfile={onOpenProfile}
          onLogout={onLogout}
        />
      </Stack>
    </Box>
  );
}

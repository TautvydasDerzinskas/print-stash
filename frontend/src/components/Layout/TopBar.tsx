import React, { useLayoutEffect, useRef } from "react";
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
  categoryId: string | null;
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
  categoryId,
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
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Publishes this bar's real rendered height (it can wrap to two lines on narrow widths, so a
  // guessed constant would drift) as a CSS var on the document root -- any sticky element further
  // down the page (currently just ModelSidePanel) reads it to stick just below the bar instead of
  // guessing a fixed offset and ending up stuck underneath it once both are pinned at once.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--topbar-height", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 1.5,
        flexWrap: "wrap",
        mb: 2,
        // Pinned to the top of the window (the app scrolls at that level, not inside `main` --
        // see AppLayout's own comment on why overflow was removed from main) so the title, back
        // button, and the Add/Notifications/User cluster stay reachable no matter how far a long
        // page (e.g. the model detail page's sticky side panel) gets scrolled. Needs its own
        // opaque background, exactly matching the shell's, or scrolled content would show through
        // behind it instead of being covered.
        position: "sticky",
        top: 0,
        zIndex: (muiTheme) => muiTheme.zIndex.appBar,
        bgcolor: (muiTheme) => muiTheme.thingport.pageBackground,
      }}
    >
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
          categoryId={categoryId}
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

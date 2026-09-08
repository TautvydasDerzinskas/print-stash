import React from "react";
import { useTranslation } from "react-i18next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import CheckIcon from "@mui/icons-material/Check";
import LogoutIcon from "@mui/icons-material/Logout";
import type { AuthUser } from "../../api/auth";
import type { ThemeSelection } from "../../constants/settingsOptions";
import { useGravatarUrl } from "../../hooks/useGravatarUrl";

const THEME_MODES: ThemeSelection[] = ["light", "dark"];

type ServiceChipDef = {
  key: "makerworld" | "thingiverse";
  label: string;
  color: string;
  connected: boolean;
};

type Props = {
  user: AuthUser | null;
  theme: ThemeSelection;
  onThemeChange: (theme: ThemeSelection) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  makerworldCookie: string;
  thingiverseCookie: string;
};

/** Avatar (Gravatar, from the account email) that opens identity + quick settings, mirroring
 *  the youtube-mp3-vault UserMenu: name/email/logout up top, Settings and a light/dark Theme
 *  submenu below, then at-a-glance MakerWorld/Thingiverse cookie status. */
export function UserMenu({ user, theme, onThemeChange, onOpenSettings, onLogout, makerworldCookie, thingiverseCookie }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const avatarUrl = useGravatarUrl(user?.email, 128);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [themeAnchorEl, setThemeAnchorEl] = React.useState<HTMLElement | null>(null);

  const closeMenu = () => setAnchorEl(null);
  const closeThemeMenu = () => setThemeAnchorEl(null);

  const handleThemeSelect = (mode: ThemeSelection) => {
    closeThemeMenu();
    closeMenu();
    if (mode !== theme) onThemeChange(mode);
  };

  const services: ServiceChipDef[] = [
    { key: "makerworld", label: "MakerWorld", color: "#F07745", connected: Boolean(makerworldCookie.trim()) },
    { key: "thingiverse", label: "Thingiverse", color: "#2B78FE", connected: Boolean(thingiverseCookie.trim()) },
  ];

  return (
    <>
      <IconButton onClick={e => setAnchorEl(e.currentTarget)} size="small">
        <Avatar
          alt={user?.display_name}
          src={avatarUrl}
          sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: 13 }}
        >
          {user?.display_name?.[0]?.toUpperCase()}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ pl: 2, pr: 1, py: 1.25, minWidth: 220, display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" fontWeight={600} noWrap>{user?.display_name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{user?.email}</Typography>
          </Box>
          <Tooltip title={t("common:logOut")}>
            <IconButton size="small" onClick={() => { closeMenu(); onLogout(); }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider />
        <MenuItem onClick={() => { closeMenu(); onOpenSettings(); }}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("common:settings")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={e => setThemeAnchorEl(e.currentTarget)}>
          <ListItemIcon><PaletteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("userMenu.theme")}</ListItemText>
        </MenuItem>
        <Divider />
        <Box sx={{ px: 2, py: 1.25, display: "flex", gap: 0.75 }}>
          {services.map(svc => (
            <Box
              key={svc.key}
              title={svc.connected ? t("userMenu.serviceConnected", { service: svc.label }) : t("userMenu.serviceNotConnected", { service: svc.label })}
              sx={{
                px: 1, py: 0.375, borderRadius: 1, fontSize: 11, fontWeight: 600, lineHeight: 1.4,
                whiteSpace: "nowrap", color: "#fff",
                // Dimming the brand color alone (e.g. 45% opacity orange) still reads as
                // "connected" at a glance -- desaturate to a neutral grey when not connected so
                // the two states are unmistakable, not just slightly different intensities.
                bgcolor: svc.connected ? svc.color : "grey.500",
                opacity: svc.connected ? 1 : 0.5,
              }}
            >
              {svc.label}
            </Box>
          ))}
        </Box>
      </Menu>
      <Menu
        anchorEl={themeAnchorEl}
        open={Boolean(themeAnchorEl)}
        onClose={closeThemeMenu}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {THEME_MODES.map(mode => (
          <MenuItem key={mode} selected={theme === mode} onClick={() => handleThemeSelect(mode)}>
            <ListItemIcon>{theme === mode && <CheckIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{t(`userMenu.${mode}`)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

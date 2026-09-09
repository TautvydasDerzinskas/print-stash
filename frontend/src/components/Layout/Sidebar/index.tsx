import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import CollectionsIcon from "@mui/icons-material/Collections";
import DownloadIcon from "@mui/icons-material/Download";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleIcon from "@mui/icons-material/People";
import HistoryIcon from "@mui/icons-material/History";
import BoltIcon from "@mui/icons-material/Bolt";
import CableIcon from "@mui/icons-material/Cable";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Wordmark from "../../Wordmark";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "printstash_sidebar_collapsed";

/** Icon-only rail row used for every nav item once the sidebar is collapsed -- a tooltip stands
 *  in for the label. */
function CollapsedNavIcon({ icon, label, selected, onClick }: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={label} placement="right">
      <ListItemButton
        selected={selected}
        onClick={onClick}
        sx={{ borderRadius: 1, mb: 0.5, justifyContent: "center", px: 0 }}
      >
        <ListItemIcon sx={{ minWidth: 0, color: selected ? "primary.main" : "text.secondary" }}>
          {icon}
        </ListItemIcon>
      </ListItemButton>
    </Tooltip>
  );
}

type Props = {
  isAdmin: boolean;
};

/** The persistent app-wide navigation rail: Dashboard, Models, Collections, Download Bridge, and
 *  (for admins) Administration. Folder browsing lives inside the Models page itself, not here. */
export default function Sidebar({ isAdmin }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });
  const [adminExpanded, setAdminExpanded] = useState(false);

  const onDashboard = location.pathname === "/";
  const onCollections = location.pathname.startsWith("/models/collections");
  const onModels = (location.pathname.startsWith("/models") && !onCollections) || location.pathname.startsWith("/authors");
  const onDownload = location.pathname.startsWith("/download");
  const onAdminSettings = location.pathname.startsWith("/admin-settings");
  const onAdminUsers = location.pathname.startsWith("/admin-users");
  const onAdminLogs = location.pathname.startsWith("/admin-logs");
  const onAdminTriggers = location.pathname.startsWith("/admin-triggers");
  const onAdminConnections = location.pathname.startsWith("/admin-connections");
  const onAdmin = onAdminSettings || onAdminUsers || onAdminLogs || onAdminTriggers || onAdminConnections;
  const adminOpen = adminExpanded || onAdmin;

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const currentWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <Box
      component="aside"
      sx={{
        width: currentWidth,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        transition: (theme) => theme.transitions.create("width", { duration: theme.transitions.duration.shortest }),
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent={collapsed ? "center" : "space-between"}
        sx={{ px: collapsed ? 1 : 2, pt: "20px", pb: "20px" }}
      >
        {!collapsed && <Wordmark size="sm" />}
        <Tooltip title={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}>
          <IconButton size="small" onClick={toggleCollapsed}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      <Box component="nav" sx={{ flex: 1, overflow: "auto", px: collapsed ? 0.5 : 1 }}>
        <List disablePadding>
          {collapsed ? (
            <CollapsedNavIcon
              icon={<SpaceDashboardIcon fontSize="small" />}
              label={t("sidebar.dashboard")}
              selected={onDashboard}
              onClick={() => navigate("/")}
            />
          ) : (
            <ListItemButton selected={onDashboard} onClick={() => navigate("/")} sx={{ borderRadius: 1, mb: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 30 }}>
                <SpaceDashboardIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t("sidebar.dashboard")} primaryTypographyProps={{ variant: "body2" }} />
            </ListItemButton>
          )}

          {collapsed ? (
            <CollapsedNavIcon
              icon={<ViewInArIcon fontSize="small" />}
              label={t("sidebar.models")}
              selected={onModels}
              onClick={() => navigate("/models")}
            />
          ) : (
            <ListItemButton
              selected={onModels}
              onClick={() => navigate("/models")}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>
                <ViewInArIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t("sidebar.models")} primaryTypographyProps={{ variant: "body2" }} />
            </ListItemButton>
          )}

          {collapsed ? (
            <CollapsedNavIcon
              icon={<CollectionsIcon fontSize="small" />}
              label={t("sidebar.collections")}
              selected={onCollections}
              onClick={() => navigate("/models/collections")}
            />
          ) : (
            <ListItemButton
              selected={onCollections}
              onClick={() => navigate("/models/collections")}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>
                <CollectionsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t("sidebar.collections")} primaryTypographyProps={{ variant: "body2" }} />
            </ListItemButton>
          )}

          {collapsed ? (
            <CollapsedNavIcon
              icon={<DownloadIcon fontSize="small" />}
              label={t("sidebar.downloadBridge")}
              selected={onDownload}
              onClick={() => navigate("/download")}
            />
          ) : (
            <ListItemButton
              selected={onDownload}
              onClick={() => navigate("/download")}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>
                <DownloadIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t("sidebar.downloadBridge")} primaryTypographyProps={{ variant: "body2" }} />
            </ListItemButton>
          )}

          {isAdmin && (
            <>
              <Divider sx={{ my: 1 }} />
              {collapsed ? (
                <>
                  <CollapsedNavIcon
                    icon={<SettingsIcon fontSize="small" />}
                    label={t("common:settings")}
                    selected={onAdminSettings}
                    onClick={() => navigate("/admin-settings")}
                  />
                  <CollapsedNavIcon
                    icon={<PeopleIcon fontSize="small" />}
                    label={t("adminSettings.users.heading")}
                    selected={onAdminUsers}
                    onClick={() => navigate("/admin-users")}
                  />
                  <CollapsedNavIcon
                    icon={<HistoryIcon fontSize="small" />}
                    label={t("adminSettings.logs.heading")}
                    selected={onAdminLogs}
                    onClick={() => navigate("/admin-logs")}
                  />
                  <CollapsedNavIcon
                    icon={<BoltIcon fontSize="small" />}
                    label={t("adminSettings.triggers.heading")}
                    selected={onAdminTriggers}
                    onClick={() => navigate("/admin-triggers")}
                  />
                  <CollapsedNavIcon
                    icon={<CableIcon fontSize="small" />}
                    label={t("adminSettings.connections.heading")}
                    selected={onAdminConnections}
                    onClick={() => navigate("/admin-connections")}
                  />
                </>
              ) : (
                <>
                  <ListItemButton
                    selected={false}
                    onClick={() => setAdminExpanded(v => !v)}
                    sx={{ borderRadius: 1, mb: 0.5 }}
                  >
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      <AdminPanelSettingsIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={t("sidebar.administration")} primaryTypographyProps={{ variant: "body2" }} />
                    {adminOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </ListItemButton>
                  <Collapse in={adminOpen}>
                    <List disablePadding>
                      <ListItemButton
                        selected={onAdminSettings}
                        onClick={() => navigate("/admin-settings")}
                        sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <SettingsIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t("common:settings")} primaryTypographyProps={{ variant: "body2" }} />
                      </ListItemButton>
                      <ListItemButton
                        selected={onAdminUsers}
                        onClick={() => navigate("/admin-users")}
                        sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <PeopleIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t("adminSettings.users.heading")} primaryTypographyProps={{ variant: "body2" }} />
                      </ListItemButton>
                      <ListItemButton
                        selected={onAdminLogs}
                        onClick={() => navigate("/admin-logs")}
                        sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <HistoryIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t("adminSettings.logs.heading")} primaryTypographyProps={{ variant: "body2" }} />
                      </ListItemButton>
                      <ListItemButton
                        selected={onAdminTriggers}
                        onClick={() => navigate("/admin-triggers")}
                        sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <BoltIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t("adminSettings.triggers.heading")} primaryTypographyProps={{ variant: "body2" }} />
                      </ListItemButton>
                      <ListItemButton
                        selected={onAdminConnections}
                        onClick={() => navigate("/admin-connections")}
                        sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <CableIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t("adminSettings.connections.heading")} primaryTypographyProps={{ variant: "body2" }} />
                      </ListItemButton>
                    </List>
                  </Collapse>
                </>
              )}
            </>
          )}
        </List>
      </Box>
    </Box>
  );
}

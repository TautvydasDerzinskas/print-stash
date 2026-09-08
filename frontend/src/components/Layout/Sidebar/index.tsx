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
import Tooltip from "@mui/material/Tooltip";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import CollectionsIcon from "@mui/icons-material/Collections";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SettingsIcon from "@mui/icons-material/Settings";
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

/** The persistent app-wide navigation rail: Dashboard, Models, and (for admins) Administration.
 *  Folder browsing lives inside the Models page itself, not here. */
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
  const onModels = location.pathname.startsWith("/models") || location.pathname.startsWith("/authors");
  const onCollections = location.pathname.startsWith("/models/collections");
  const onAdmin = location.pathname.startsWith("/admin-settings");
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
        sx={{ px: collapsed ? 1 : 2, pt: 2, pb: 1.5 }}
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
            <>
              <ListItemButton
                selected={onModels && !onCollections}
                onClick={() => navigate("/models")}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  <ViewInArIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={t("sidebar.models")} primaryTypographyProps={{ variant: "body2" }} />
              </ListItemButton>
              <Collapse in={onModels}>
                <List disablePadding>
                  <ListItemButton
                    selected={onCollections}
                    onClick={() => navigate("/models/collections")}
                    sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                  >
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      <CollectionsIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={t("sidebar.collections")} primaryTypographyProps={{ variant: "body2" }} />
                  </ListItemButton>
                </List>
              </Collapse>
            </>
          )}

          {isAdmin && (
            collapsed ? (
              <CollapsedNavIcon
                icon={<AdminPanelSettingsIcon fontSize="small" />}
                label={t("sidebar.administration")}
                selected={onAdmin}
                onClick={() => navigate("/admin-settings")}
              />
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
                      selected={onAdmin}
                      onClick={() => navigate("/admin-settings")}
                      sx={{ borderRadius: 1, mb: 0.5, pl: 4 }}
                    >
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <SettingsIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={t("common:settings")} primaryTypographyProps={{ variant: "body2" }} />
                    </ListItemButton>
                  </List>
                </Collapse>
              </>
            )
          )}
        </List>
      </Box>
    </Box>
  );
}

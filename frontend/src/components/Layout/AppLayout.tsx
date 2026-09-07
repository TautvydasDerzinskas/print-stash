import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Sidebar from "../../pages/LibraryPage/Sidebar";
import TopBar from "./TopBar";
import { ConfirmProvider } from "../ConfirmProvider";
import type { ResolvedTheme, ThemeSelection } from "../../constants/settingsOptions";
import type { AuthUser } from "../../api/auth";
import type { ActiveView } from "../../constants/views";

type AppLayoutProps = {
  muiTheme: Theme;
  resolvedTheme: ResolvedTheme;
  apiUp: boolean | null;
  folderId: string | null;
  onSelectFolder: (id: string | null) => void;
  folderVersion: number;
  onFoldersChanged: () => void;
  onPrintsChanged: () => void;
  onUnauthorized: () => void;
  activeView: ActiveView;
  isAdmin: boolean;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  onOpenAdminSettings: () => void;
  onBack: () => void;
  onLogout: () => void;
  makerworldCookie: string;
  thingiverseCookie: string;
  user: AuthUser | null;
  onThemeChange: (theme: ThemeSelection) => void;
  children: React.ReactNode;
};

const VIEW_TITLE_KEYS: Record<ActiveView, string> = {
  dashboard: "sidebar.dashboard",
  library: "sidebar.libraryTitle",
  settings: "common:settings",
  adminSettings: "adminSettings.pageTitle",
};

/** The persistent app shell: theming, the folder sidebar, and the header row (back button +
 *  title, then the global Add/Notifications/User cluster). `children` is the active view's
 *  content. */
export default function AppLayout({
  muiTheme,
  resolvedTheme,
  apiUp,
  folderId,
  onSelectFolder,
  folderVersion,
  onFoldersChanged,
  onPrintsChanged,
  onUnauthorized,
  activeView,
  isAdmin,
  onOpenDashboard,
  onOpenSettings,
  onOpenAdminSettings,
  onBack,
  onLogout,
  makerworldCookie,
  thingiverseCookie,
  user,
  onThemeChange,
  children,
}: AppLayoutProps) {
  const { t } = useTranslation(["app", "common"]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <ConfirmProvider>
        <Box
          sx={{
            background: (theme) => theme.printstash.pageBackground,
            minHeight: "100vh",
            display: "flex",
          }}
        >
          <Sidebar
            selectedId={folderId}
            onSelect={onSelectFolder}
            onFoldersChanged={onFoldersChanged}
            foldersVersion={folderVersion}
            onAssetsChanged={onPrintsChanged}
            onUnauthorized={onUnauthorized}
            activeView={activeView}
            isAdmin={isAdmin}
            onOpenDashboard={onOpenDashboard}
            onOpenAdminSettings={onOpenAdminSettings}
          />
          <Box component="main" sx={{ flex: 1, p: 2, overflow: "auto" }}>
            {apiUp === false && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {t("shell.apiUnreachable")}
              </Alert>
            )}
            <TopBar
              title={t(VIEW_TITLE_KEYS[activeView])}
              onBack={activeView === "settings" ? onBack : undefined}
              showAddMenu={activeView === "library"}
              folderId={folderId}
              makerworldCookie={makerworldCookie}
              thingiverseCookie={thingiverseCookie}
              onUploaded={onPrintsChanged}
              onUnauthorized={onUnauthorized}
              user={user}
              theme={resolvedTheme}
              onThemeChange={onThemeChange}
              onOpenSettings={onOpenSettings}
              onLogout={onLogout}
            />
            {children}
          </Box>
        </Box>
      </ConfirmProvider>
    </ThemeProvider>
  );
}

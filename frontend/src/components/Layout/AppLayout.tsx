import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { ConfirmProvider } from "../ConfirmProvider";
import { PageHeaderContext, type PageHeader } from "./PageHeaderContext";
import type { ResolvedTheme, ThemeSelection } from "../../constants/settingsOptions";
import type { AuthUser } from "../../api/auth";

type AppLayoutProps = {
  muiTheme: Theme;
  resolvedTheme: ResolvedTheme;
  apiUp: boolean | null;
  folderId: string | null;
  onPrintsChanged: () => void;
  onUnauthorized: () => void;
  isAdmin: boolean;
  onOpenSettings: () => void;
  onLogout: () => void;
  makerworldCookie: string;
  thingiverseCookie: string;
  user: AuthUser | null;
  onThemeChange: (theme: ThemeSelection) => void;
  children: React.ReactNode;
};

/** Derives the header title + whether a back button is shown from the current route -- there's
 *  no per-route config table beyond this since the set of routes is small and each is distinct
 *  chrome-wise. */
function useRouteChrome() {
  const { t } = useTranslation(["app", "models", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  let title = t("sidebar.dashboard");
  let showBack = false;
  if (path === "/") {
    title = t("sidebar.dashboard");
  } else if (path === "/models/collections") {
    title = t("models:collections.pageTitle");
    showBack = true;
  } else if (path.startsWith("/models/collections/")) {
    // Overridden by CollectionDetailPage's usePageHeader once the collection loads.
    title = t("models:collections.pageTitle");
    showBack = true;
  } else if (path.startsWith("/models/")) {
    title = t("models:pageTitle");
    showBack = true;
  } else if (path === "/models") {
    title = t("models:pageTitle");
  } else if (path.startsWith("/authors/")) {
    title = t("models:author.pageTitle");
    showBack = true;
  } else if (path === "/settings") {
    title = t("common:settings");
    showBack = true;
  } else if (path.startsWith("/admin-settings")) {
    title = t("adminSettings.pageTitle");
    showBack = true;
  }

  return { title, onBack: showBack ? () => navigate(-1) : undefined };
}

/** The persistent app shell: theming, the nav sidebar, and the header row (back button + title,
 *  then the global Add/Notifications/User cluster). `children` is the routed page content. */
export default function AppLayout({
  muiTheme,
  resolvedTheme,
  apiUp,
  folderId,
  onPrintsChanged,
  onUnauthorized,
  isAdmin,
  onOpenSettings,
  onLogout,
  makerworldCookie,
  thingiverseCookie,
  user,
  onThemeChange,
  children,
}: AppLayoutProps) {
  const { t } = useTranslation(["app", "common"]);
  const { title: routeTitle, onBack } = useRouteChrome();
  const [pageHeader, setPageHeader] = React.useState<PageHeader>(null);

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
          <Sidebar isAdmin={isAdmin} />
          <Box component="main" sx={{ flex: 1, p: 2, overflow: "auto" }}>
            {apiUp === false && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {t("shell.apiUnreachable")}
              </Alert>
            )}
            <TopBar
              title={pageHeader?.title || routeTitle}
              onBack={onBack}
              actions={pageHeader?.actions}
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
            <PageHeaderContext.Provider value={setPageHeader}>
              {children}
            </PageHeaderContext.Provider>
          </Box>
        </Box>
      </ConfirmProvider>
    </ThemeProvider>
  );
}

import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ImportProgressBar from "./ImportProgressBar";
import { ConfirmProvider } from "../ConfirmProvider";
import { PageHeaderContext, type PageHeader } from "./PageHeaderContext";
import { ImportJobProvider } from "./ImportJobContext";
import { NotificationsProvider, useNotifications } from "./NotificationsContext";
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
  user: AuthUser | null;
  onThemeChange: (theme: ThemeSelection) => void;
  children: React.ReactNode;
};

/** Derives the header title + default back-button destination from the current route -- there's
 *  no per-route config table beyond this since the set of routes is small and each is distinct
 *  chrome-wise. Most routes just retrace browser history (wherever the user drilled in from);
 *  the two top-level list routes (Models, Collections) instead go to a fixed destination since
 *  they're reachable directly from the sidebar with no meaningful "came from" page. A page can
 *  still override this default via usePageHeader's `onBack` -- see ModelsPage, whose back
 *  button clears an active category filter instead of leaving the page while one's selected. */
function useRouteChrome() {
  const { t } = useTranslation(["app", "models", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  let title = t("sidebar.dashboard");
  let onBack: (() => void) | undefined;
  if (path === "/") {
    title = t("sidebar.dashboard");
  } else if (path === "/models/collections") {
    title = t("models:collections.pageTitle");
    onBack = () => navigate("/");
  } else if (path.startsWith("/models/collections/")) {
    // Overridden by CollectionDetailPage's usePageHeader once the collection loads.
    title = t("models:collections.pageTitle");
    onBack = () => navigate(-1);
  } else if (path.startsWith("/models/")) {
    title = t("models:pageTitle");
    onBack = () => navigate(-1);
  } else if (path === "/models") {
    title = t("models:pageTitle");
    onBack = () => navigate("/");
  } else if (path.startsWith("/authors/")) {
    title = t("models:author.pageTitle");
    onBack = () => navigate(-1);
  } else if (path === "/settings") {
    title = t("common:settings");
    onBack = () => navigate(-1);
  } else if (path.startsWith("/admin-settings")) {
    title = t("adminSettings.pageTitle");
    onBack = () => navigate(-1);
  }

  return { title, onBack };
}

type ShellProps = Omit<AppLayoutProps, "muiTheme">;

/** Sits inside both NotificationsProvider and ImportJobProvider so it can wire a finished
 *  import job to a grid refresh + notification refresh, then renders the actual shell chrome.
 *  Split out from AppLayout because that wiring needs useNotifications(), which only works
 *  below the provider AppLayout itself renders. */
function AppLayoutShell({
  resolvedTheme,
  apiUp,
  folderId,
  onPrintsChanged,
  onUnauthorized,
  isAdmin,
  onOpenSettings,
  onLogout,
  makerworldCookie,
  user,
  onThemeChange,
  children,
}: ShellProps) {
  const { t } = useTranslation(["app", "common"]);
  const { title: routeTitle, onBack: routeOnBack } = useRouteChrome();
  const [pageHeader, setPageHeader] = React.useState<PageHeader>(null);
  const { refresh: refreshNotifications } = useNotifications();

  const handleJobCompleted = React.useCallback(() => {
    onPrintsChanged();
    void refreshNotifications();
  }, [onPrintsChanged, refreshNotifications]);

  return (
    <ImportJobProvider onUnauthorized={onUnauthorized} onJobCompleted={handleJobCompleted}>
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
            onBack={pageHeader?.onBack ?? routeOnBack}
            actions={pageHeader?.actions}
            folderId={folderId}
            makerworldCookie={makerworldCookie}
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
      <ImportProgressBar />
    </ImportJobProvider>
  );
}

/** The persistent app shell: theming, the nav sidebar, and the header row (back button + title,
 *  then the global Add/Notifications/User cluster). `children` is the routed page content. */
export default function AppLayout({ muiTheme, onUnauthorized, ...shellProps }: AppLayoutProps) {
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <ConfirmProvider>
        <NotificationsProvider onUnauthorized={onUnauthorized}>
          <AppLayoutShell onUnauthorized={onUnauthorized} {...shellProps} />
        </NotificationsProvider>
      </ConfirmProvider>
    </ThemeProvider>
  );
}

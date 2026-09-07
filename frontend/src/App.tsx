import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import AppLayout from "./components/Layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import LibraryPage from "./pages/LibraryPage";
import AuthPage from "./pages/AuthPage";
import SettingsPage from "./pages/SettingsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import { healthApi, type HealthInfo } from "./api/health";
import { authApi, type AuthUser } from "./api/auth";
import { settingsApi, type PreviewMode } from "./api/settings";
import { clearToken, clearUser, readToken, readUser, storeToken, storeUser } from "./utils/auth";
import { type AppSettings, loadSettings, saveSettings } from "./utils/settings";
import { buildTheme } from "./theme";
import type { ActiveView } from "./constants/views";

const DEFAULT_REFRESH_SECONDS = 6 * 60 * 60; // 6 hours
// Views reachable directly from the sidebar -- "back" from a drilled-into page (Settings) always
// returns to whichever of these the user was last on, not always the app's default landing page.
const MAIN_VIEWS = new Set<ActiveView>(["dashboard", "library"]);

export default function App() {
  const { t } = useTranslation(["app", "common"]);
  const [token, setToken] = React.useState<string | null>(() => readToken());
  const [user, setUser] = React.useState<AuthUser | null>(() => readUser());
  const [nonce, setNonce] = React.useState(0);
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [folderVersion, setFolderVersion] = React.useState(0);
  const [health, setHealth] = React.useState<HealthInfo | null>(null);
  const [tokenTtl, setTokenTtl] = React.useState<number | null>(null);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [activeView, setActiveView] = React.useState<ActiveView>("dashboard");
  const [settings, setSettings] = React.useState<AppSettings>(() => loadSettings());
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("automatic");
  const resolvedTheme = settings.theme.selected;
  const muiTheme = React.useMemo(() => buildTheme(resolvedTheme), [resolvedTheme]);
  const isAdmin = user?.role === "ADMIN";
  // "Back" from Settings (opened from the avatar menu, not a sidebar link) returns here --
  // whichever sidebar-level view the user was last on, not always the app's default.
  const lastMainViewRef = React.useRef<ActiveView>("dashboard");
  React.useEffect(() => {
    if (MAIN_VIEWS.has(activeView)) lastMainViewRef.current = activeView;
  }, [activeView]);
  React.useEffect(() => { (async ()=> setHealth(await healthApi.get()))(); }, []);
  React.useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setPreviewMode((await settingsApi.getPreviews()).mode);
      } catch {
        // Keep the "automatic" default -- previews just aren't the reason to block the app.
      }
    })();
  }, [token]);
  React.useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  const apiUp = health?.ok ?? null;
  const authRequired = health?.auth_required ?? true;

  const handleLogin = (tok: string, ttl: number, loggedInUser: AuthUser) => {
    storeToken(tok);
    storeUser(loggedInUser);
    setToken(tok);
    setUser(loggedInUser);
    setTokenTtl(ttl);
    setSessionExpired(false);
  };

  const handleUnauthorized = React.useCallback(() => {
    if (sessionExpired) return;
    clearToken();
    setToken(null);
    setTokenTtl(null);
    setSessionExpired(true);
    alert(t("shell.sessionExpired"));
  }, [sessionExpired, t]);

  const handleFoldersChanged = React.useCallback(() => {
    setFolderVersion(v => v + 1);
  }, []);

  const handlePrintsChanged = React.useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  const handleSelectFolder = React.useCallback((id: string | null) => {
    setFolderId(id);
    setActiveView("library");
  }, []);

  const handleLogout = () => {
    clearToken();
    clearUser();
    setToken(null);
    setUser(null);
    setTokenTtl(null);
  };

  React.useEffect(() => {
    if (!token) return;
    const ttl = tokenTtl ?? DEFAULT_REFRESH_SECONDS;
    const refreshMs = Math.max(
      5 * 60 * 1000,
      Math.min(ttl * 0.8 * 1000, ttl * 1000 - 5 * 60 * 1000)
    );
    const timer = window.setTimeout(async () => {
      try {
        const res = await authApi.refresh();
        storeToken(res.token);
        setToken(res.token);
        setTokenTtl(res.expires_in);
      } catch {
        handleUnauthorized();
      }
    }, refreshMs);
    return () => window.clearTimeout(timer);
  }, [token, tokenTtl, handleUnauthorized]);

  if (authRequired && !token) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <Box
          sx={{
            background: (theme) => theme.printstash.pageBackground,
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
          }}
        >
          <AuthPage
            onSuccess={handleLogin}
            apiUp={apiUp}
            allowRegistrations={health?.allow_registrations ?? true}
          />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <AppLayout
      muiTheme={muiTheme}
      resolvedTheme={resolvedTheme}
      apiUp={apiUp}
      folderId={folderId}
      onSelectFolder={handleSelectFolder}
      folderVersion={folderVersion}
      onFoldersChanged={handleFoldersChanged}
      onPrintsChanged={handlePrintsChanged}
      onUnauthorized={handleUnauthorized}
      activeView={activeView}
      isAdmin={isAdmin}
      onOpenDashboard={() => setActiveView("dashboard")}
      onOpenSettings={() => setActiveView("settings")}
      onOpenAdminSettings={() => setActiveView("adminSettings")}
      onBack={() => setActiveView(lastMainViewRef.current)}
      onLogout={handleLogout}
      makerworldCookie={settings.makerworld.cookie}
      thingiverseCookie={settings.thingiverse.cookie}
      user={user}
      onThemeChange={selected => setSettings(prev => ({ ...prev, theme: { selected } }))}
    >
      {activeView === "dashboard" && <DashboardPage />}
      {activeView === "library" && (
        <LibraryPage
          key={`${nonce + (folderId||'')}-${folderVersion}`}
          folderId={folderId}
          foldersVersion={folderVersion}
          onUnauthorized={handleUnauthorized}
          slicerSettings={settings.slicer}
          engravingSettings={settings.engraving}
          previewMode={previewMode}
          theme={resolvedTheme}
        />
      )}
      {activeView === "settings" && (
        <SettingsPage
          settings={settings}
          onChange={setSettings}
          onAssetsChanged={handlePrintsChanged}
          onFoldersChanged={handleFoldersChanged}
          onUnauthorized={handleUnauthorized}
          onSelectFolder={handleSelectFolder}
        />
      )}
      {activeView === "adminSettings" && (
        <AdminSettingsPage
          onUnauthorized={handleUnauthorized}
          onPreviewModeChanged={setPreviewMode}
        />
      )}
    </AppLayout>
  );
}

import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import AppLayout from "./components/Layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import ModelsPage from "./pages/ModelsPage";
import ModelDetailPage from "./pages/ModelDetailPage";
import CollectionsPage from "./pages/CollectionsPage";
import CollectionDetailPage from "./pages/CollectionDetailPage";
import AuthorPage from "./pages/AuthorPage";
import AuthPage from "./pages/AuthPage";
import SettingsPage from "./pages/SettingsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import { healthApi, type HealthInfo } from "./api/health";
import { authApi, type AuthUser } from "./api/auth";
import { settingsApi, type PreviewMode } from "./api/settings";
import { clearToken, clearUser, readToken, readUser, storeToken, storeUser } from "./utils/auth";
import { type AppSettings, loadSettings, saveSettings } from "./utils/settings";
import { buildTheme } from "./theme";

const DEFAULT_REFRESH_SECONDS = 6 * 60 * 60; // 6 hours

type AppShellProps = {
  isAdmin: boolean;
  user: AuthUser | null;
  apiUp: boolean | null;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
  resolvedTheme: AppSettings["theme"]["selected"];
  muiTheme: ReturnType<typeof buildTheme>;
  onUnauthorized: () => void;
  onLogout: () => void;
};

/** Everything that needs router context (route-derived chrome, folder selection that also
 *  navigates). Split out from App so App itself can stay outside <BrowserRouter>. */
function AppShell({
  isAdmin,
  user,
  apiUp,
  settings,
  setSettings,
  previewMode,
  setPreviewMode,
  resolvedTheme,
  muiTheme,
  onUnauthorized,
  onLogout,
}: AppShellProps) {
  const navigate = useNavigate();
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [folderVersion, setFolderVersion] = React.useState(0);

  const handleFoldersChanged = React.useCallback(() => {
    setFolderVersion(v => v + 1);
  }, []);

  const handlePrintsChanged = React.useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  // Used after a folder-scan import in Settings finishes -- jump to Models filtered to the
  // folder the import landed in.
  const handleSelectFolder = React.useCallback((id: string | null) => {
    setFolderId(id);
    navigate("/models");
  }, [navigate]);

  return (
    <AppLayout
      muiTheme={muiTheme}
      resolvedTheme={resolvedTheme}
      apiUp={apiUp}
      folderId={folderId}
      onPrintsChanged={handlePrintsChanged}
      onUnauthorized={onUnauthorized}
      isAdmin={isAdmin}
      onOpenSettings={() => navigate("/settings")}
      onLogout={onLogout}
      makerworldCookie={settings.makerworld.cookie}
      thingiverseCookie={settings.thingiverse.cookie}
      user={user}
      onThemeChange={selected => setSettings(prev => ({ ...prev, theme: { selected } }))}
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/models"
          element={
            <ModelsPage
              folderId={folderId}
              onSelectFolder={setFolderId}
              foldersVersion={folderVersion}
              onFoldersChanged={handleFoldersChanged}
              printsVersion={nonce}
              onUnauthorized={onUnauthorized}
              theme={resolvedTheme}
              previewMode={previewMode}
            />
          }
        />
        <Route
          path="/models/collections"
          element={<CollectionsPage theme={resolvedTheme} previewMode={previewMode} onUnauthorized={onUnauthorized} />}
        />
        <Route
          path="/models/collections/:collectionId"
          element={<CollectionDetailPage theme={resolvedTheme} previewMode={previewMode} onUnauthorized={onUnauthorized} />}
        />
        <Route
          path="/models/:printId"
          element={<ModelDetailPage theme={resolvedTheme} onUnauthorized={onUnauthorized} />}
        />
        <Route path="/authors/:authorId" element={<AuthorPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              settings={settings}
              onChange={setSettings}
              onAssetsChanged={handlePrintsChanged}
              onFoldersChanged={handleFoldersChanged}
              onUnauthorized={onUnauthorized}
              onSelectFolder={handleSelectFolder}
            />
          }
        />
        <Route
          path="/admin-settings"
          element={
            isAdmin
              ? <AdminSettingsPage onUnauthorized={onUnauthorized} onPreviewModeChanged={setPreviewMode} />
              : <Navigate to="/" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  const { t } = useTranslation("app");
  const [token, setToken] = React.useState<string | null>(() => readToken());
  const [user, setUser] = React.useState<AuthUser | null>(() => readUser());
  const [health, setHealth] = React.useState<HealthInfo | null>(null);
  const [tokenTtl, setTokenTtl] = React.useState<number | null>(null);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [settings, setSettings] = React.useState<AppSettings>(() => loadSettings());
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("automatic");
  const resolvedTheme = settings.theme.selected;
  const muiTheme = React.useMemo(() => buildTheme(resolvedTheme), [resolvedTheme]);
  const isAdmin = user?.role === "ADMIN";
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
    <BrowserRouter>
      <AppShell
        isAdmin={isAdmin}
        user={user}
        apiUp={apiUp}
        settings={settings}
        setSettings={setSettings}
        previewMode={previewMode}
        setPreviewMode={setPreviewMode}
        resolvedTheme={resolvedTheme}
        muiTheme={muiTheme}
        onUnauthorized={handleUnauthorized}
        onLogout={handleLogout}
      />
    </BrowserRouter>
  );
}

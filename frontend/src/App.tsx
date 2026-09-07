import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import AppLayout from "./common/layout/AppLayout";
import PrintGrid from "./routes/library";
import Login from "./routes/login";
import Settings from "./routes/settings";
import { apiHealth, getApiBase, refreshToken, type HealthInfo } from "./services/api";
import { clearToken, readToken, storeToken } from "./services/auth";
import { type AppSettings, loadSettings, saveSettings } from "./services/settings";
import { resolveTheme } from "./utils/settingsHelpers";
import { buildTheme } from "./theme";

const DEFAULT_REFRESH_SECONDS = 6 * 60 * 60; // 6 hours

export default function App() {
  const { t } = useTranslation(["app", "common"]);
  const [token, setToken] = React.useState<string | null>(() => readToken());
  const [nonce, setNonce] = React.useState(0);
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [folderVersion, setFolderVersion] = React.useState(0);
  const [health, setHealth] = React.useState<HealthInfo | null>(null);
  const [tokenTtl, setTokenTtl] = React.useState<number | null>(null);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [activeView, setActiveView] = React.useState<"library" | "settings">("library");
  const [settings, setSettings] = React.useState<AppSettings>(() => loadSettings());
  const resolvedTheme = React.useMemo(
    () => resolveTheme(settings.theme.selected),
    [settings.theme.selected]
  );
  const muiTheme = React.useMemo(() => buildTheme(resolvedTheme), [resolvedTheme]);
  React.useEffect(() => { (async ()=> setHealth(await apiHealth()))(); }, [settings.network.publicUrl]);
  React.useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  const apiUp = health?.ok ?? null;
  const authRequired = health?.auth_required ?? true;

  const handleLogin = (tok: string, ttl: number) => {
    storeToken(tok);
    setToken(tok);
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
    setToken(null);
    setTokenTtl(null);
  };

  const resetSavedProxyUrl = () => {
    setSettings(prev => ({
      ...prev,
      network: {
        ...prev.network,
        publicUrl: "",
      },
    }));
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
        const res = await refreshToken();
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
          <Login onSuccess={handleLogin} apiUp={apiUp} theme={resolvedTheme} />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <AppLayout
      muiTheme={muiTheme}
      resolvedTheme={resolvedTheme}
      apiUp={apiUp}
      apiBase={getApiBase()}
      publicUrl={settings.network.publicUrl}
      onResetProxyUrl={resetSavedProxyUrl}
      folderId={folderId}
      onSelectFolder={handleSelectFolder}
      folderVersion={folderVersion}
      onFoldersChanged={handleFoldersChanged}
      onPrintsChanged={handlePrintsChanged}
      onUnauthorized={handleUnauthorized}
      activeView={activeView}
      onOpenSettings={() => setActiveView("settings")}
      onBackToLibrary={() => setActiveView("library")}
      onLogout={handleLogout}
      makerworldCookie={settings.makerworld.cookie}
      thingiverseCookie={settings.thingiverse.cookie}
    >
      {activeView === "library" ? (
        <PrintGrid
          key={`${nonce + (folderId||'')}-${folderVersion}`}
          folderId={folderId}
          foldersVersion={folderVersion}
          onUnauthorized={handleUnauthorized}
          slicerSettings={settings.slicer}
          engravingSettings={settings.engraving}
          previewSettings={settings.previews}
          theme={resolvedTheme}
        />
      ) : (
        <Settings
          settings={settings}
          onChange={setSettings}
          onAssetsChanged={handlePrintsChanged}
          onFoldersChanged={handleFoldersChanged}
          onUnauthorized={handleUnauthorized}
          onSelectFolder={handleSelectFolder}
        />
      )}
    </AppLayout>
  );
}

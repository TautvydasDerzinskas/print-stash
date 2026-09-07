import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Sidebar from "../../routes/library/components/Sidebar";
import UploadBar from "../../routes/library/components/UploadBar";
import Wordmark from "../Wordmark";
import type { ResolvedTheme } from "../../constants/settingsOptions";

type AppLayoutProps = {
  muiTheme: Theme;
  resolvedTheme: ResolvedTheme;
  apiUp: boolean | null;
  publicUrl: string;
  onResetProxyUrl: () => void;
  folderId: string | null;
  onSelectFolder: (id: string | null) => void;
  folderVersion: number;
  onFoldersChanged: () => void;
  onPrintsChanged: () => void;
  onUnauthorized: () => void;
  activeView: "library" | "settings";
  onOpenSettings: () => void;
  onBackToLibrary: () => void;
  onLogout: () => void;
  makerworldCookie: string;
  thingiverseCookie: string;
  apiBase: string;
  children: React.ReactNode;
};

/** The persistent app shell: theming, the folder sidebar, and the header row (wordmark, upload
 *  bar or back-to-library button, logout). `children` is the active route's content. */
export default function AppLayout({
  muiTheme,
  resolvedTheme,
  apiUp,
  publicUrl,
  onResetProxyUrl,
  folderId,
  onSelectFolder,
  folderVersion,
  onFoldersChanged,
  onPrintsChanged,
  onUnauthorized,
  activeView,
  onOpenSettings,
  onBackToLibrary,
  onLogout,
  makerworldCookie,
  thingiverseCookie,
  apiBase,
  children,
}: AppLayoutProps) {
  const { t } = useTranslation(["app", "common"]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
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
          onOpenSettings={onOpenSettings}
          activeView={activeView}
        />
        <Box component="main" sx={{ flex: 1, p: 2, overflow: "auto" }}>
          {apiUp === false && (
            <Alert
              severity="error"
              sx={{ mb: 1.5 }}
              action={
                !!publicUrl && (
                  <Button color="inherit" size="small" onClick={onResetProxyUrl}>
                    {t("shell.resetProxyUrl")}
                  </Button>
                )
              }
            >
              {t("shell.apiUnreachable", { base: apiBase })}
            </Alert>
          )}
          <Stack
            direction="row"
            flexWrap="wrap"
            alignItems="center"
            justifyContent="space-between"
            gap={2}
            sx={{ mb: 2 }}
          >
            {activeView === "library" && <Wordmark theme={resolvedTheme} size="lg" />}
            <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.5}>
              {activeView === "library" ? (
                <UploadBar
                  folderId={folderId}
                  makerworldCookie={makerworldCookie}
                  thingiverseCookie={thingiverseCookie}
                  onUploaded={onPrintsChanged}
                  onUnauthorized={onUnauthorized}
                />
              ) : (
                <Button variant="outlined" onClick={onBackToLibrary}>
                  {t("shell.backToLibrary")}
                </Button>
              )}
              <Button
                variant="outlined"
                onClick={() => {
                  if (confirm(t("shell.confirmLogout"))) {
                    onLogout();
                  }
                }}
              >
                {t("common:logOut")}
              </Button>
            </Stack>
          </Stack>
          {children}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

import { useTranslation, Trans } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import DownloadIcon from "@mui/icons-material/Download";
import LaptopWindowsIcon from "@mui/icons-material/LaptopWindows";
import AppleIcon from "@mui/icons-material/Apple";
import TerminalIcon from "@mui/icons-material/Terminal";
import CableIcon from "@mui/icons-material/Cable";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { BRIDGE_DOWNLOADS, BRIDGE_RELEASES_PAGE, bridgeDownloadUrl } from "../../constants/bridge";

const OS_ICON = { windows: LaptopWindowsIcon, macos: AppleIcon, linux: TerminalIcon };

// launchd doesn't expand `~`, so the plist needs an absolute path -- the user has to swap in
// their own username either way, since we can't know it here.
const MACOS_LAUNCH_AGENT_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.printstash.bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/Applications/PrintStash Bridge.app/Contents/MacOS/print-stash-bridge</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;

const MACOS_LAUNCH_AGENT_LOAD_CMD = `mkdir -p ~/Library/LaunchAgents
# save the file above as ~/Library/LaunchAgents/com.printstash.bridge.plist
launchctl load ~/Library/LaunchAgents/com.printstash.bridge.plist`;

function CodeBlock({ children }: { children: string }) {
  return (
    <Box
      component="pre"
      sx={{
        fontFamily: "monospace",
        fontSize: 12,
        bgcolor: "action.hover",
        p: 1.5,
        borderRadius: 1,
        overflowX: "auto",
        m: 0,
      }}
    >
      {children}
    </Box>
  );
}

export default function DownloadPage() {
  const { t } = useTranslation(["app", "common"]);
  usePageHeader({ title: t("sidebar.downloadBridge") });

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <CableIcon color="primary" sx={{ mt: 0.5 }} />
        <Box>
          <Typography variant="h6" fontWeight={600}>{t("download.pageTitle")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("download.intro")}</Typography>
        </Box>
      </Stack>

      <Alert severity="info" variant="outlined">
        <Typography variant="body2">{t("download.why")}</Typography>
      </Alert>

      <Stack spacing={2}>
        <Typography variant="subtitle1" fontWeight={600}>{t("download.downloadHeading")}</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          {BRIDGE_DOWNLOADS.map(({ os, label, asset }) => {
            const Icon = OS_ICON[os];
            return (
              <Paper key={os} variant="outlined" sx={{ p: 2.5, flex: 1 }}>
                <Stack spacing={1.5} alignItems="flex-start">
                  <Icon fontSize="large" />
                  <Typography variant="subtitle2" fontWeight={600}>{label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t(`download.install.${os}`)}
                  </Typography>
                  <Button
                    component="a"
                    href={bridgeDownloadUrl(asset)}
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon fontSize="small" />}
                  >
                    {t("common:download")}
                  </Button>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Stack>

      <Stack spacing={1.5}>
        <Typography variant="subtitle1" fontWeight={600}>{t("download.autostart.heading")}</Typography>
        <Typography variant="body2" color="text.secondary">{t("download.autostart.windowsLinuxNote")}</Typography>
        <Typography variant="body2" color="text.secondary">{t("download.autostart.macosIntro")}</Typography>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
            {t("download.autostart.macosGuiHeading")}
          </Typography>
          <Typography variant="body2" color="text.secondary">{t("download.autostart.macosGuiSteps")}</Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
            {t("download.autostart.macosLaunchAgentHeading")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("download.autostart.macosLaunchAgentIntro")}
          </Typography>
          <CodeBlock>{MACOS_LAUNCH_AGENT_PLIST}</CodeBlock>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 1 }}>
            {t("download.autostart.macosLaunchAgentLoad")}
          </Typography>
          <CodeBlock>{MACOS_LAUNCH_AGENT_LOAD_CMD}</CodeBlock>
        </Paper>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        <Trans
          t={t}
          i18nKey="download.footerLinks"
          components={{
            releases: <Link href={BRIDGE_RELEASES_PAGE} target="_blank" rel="noopener noreferrer" />,
          }}
        />
      </Typography>
    </Stack>
  );
}

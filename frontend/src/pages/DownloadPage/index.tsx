import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DownloadIcon from "@mui/icons-material/Download";
import LaptopWindowsIcon from "@mui/icons-material/LaptopWindows";
import AppleIcon from "@mui/icons-material/Apple";
import TerminalIcon from "@mui/icons-material/Terminal";
import CableIcon from "@mui/icons-material/Cable";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { BRIDGE_DOWNLOADS, bridgeDownloadUrl, type BridgeDownload } from "../../constants/bridge";

const OS_ICON = { windows: LaptopWindowsIcon, macos: AppleIcon, linux: TerminalIcon };

type InstallStep = { text: string; code?: string };

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

function InstallSteps({ steps }: { steps: InstallStep[] }) {
  return (
    <Stack spacing={2}>
      {steps.map((step, i) => (
        <Stack key={i} direction="row" spacing={1.5}>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
              mt: "1px",
            }}
          >
            {i + 1}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2">{step.text}</Typography>
            {step.code && <Box sx={{ mt: 1 }}><CodeBlock>{step.code}</CodeBlock></Box>}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

export default function DownloadPage() {
  const { t } = useTranslation(["app", "common"]);
  usePageHeader({ title: t("sidebar.downloads") });

  const [installOs, setInstallOs] = useState<BridgeDownload["os"] | null>(null);

  const installSteps: Record<BridgeDownload["os"], InstallStep[]> = {
    windows: [{ text: t("download.modal.windows.step1") }],
    linux: [
      { text: t("download.modal.linux.step1"), code: "chmod +x print-stash-bridge-linux-amd64" },
      { text: t("download.modal.linux.step2"), code: "./print-stash-bridge-linux-amd64" },
    ],
    macos: [
      { text: t("download.modal.macos.step1"), code: "chmod +x ~/Downloads/print-stash-bridge-macos" },
      {
        text: t("download.modal.macos.step2"),
        code: "xattr -d com.apple.quarantine ~/Downloads/print-stash-bridge-macos",
      },
      { text: t("download.modal.macos.step3"), code: "~/Downloads/print-stash-bridge-macos --install" },
    ],
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <CableIcon color="primary" sx={{ mt: 0.5 }} />
        <Box>
          <Typography variant="h6" fontWeight={600}>{t("download.pageTitle")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("download.intro")}</Typography>
        </Box>
      </Stack>

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
                  <Button
                    component="a"
                    href={bridgeDownloadUrl(asset)}
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon fontSize="small" />}
                    onClick={() => setInstallOs(os)}
                  >
                    {t("common:download")}
                  </Button>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Stack>

      <Dialog open={installOs !== null} onClose={() => setInstallOs(null)} maxWidth="xs" fullWidth>
        {installOs && (
          <>
            <DialogTitle>{t(`download.modal.${installOs}.heading`)}</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                {t("download.modal.startedNote")}
              </Typography>
              <InstallSteps steps={installSteps[installOs]} />
              {installOs === "macos" && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2.5 }}>
                  {t("download.modal.macos.note")}
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setInstallOs(null)}>{t("common:close")}</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
}

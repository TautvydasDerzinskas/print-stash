import React from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Wordmark from "../../components/Wordmark";
import { authApi, type AuthUser } from "../../api/auth";

type Props = {
  onSuccess: (token: string, expires_in: number, user: AuthUser) => void;
};

/** Reached from the link in the verification email (see backend's mailer.ts) -- rendered by
 *  App.tsx in place of AuthPage whenever the pre-login browser is at /verify-email. There's no
 *  router at that point in the tree (see App.tsx's comment), so this reads `token` straight off
 *  `window.location` rather than via react-router. On success it logs the user straight in --
 *  see routes/auth.ts's POST /verify-email, which issues a token the same way /login does. */
export default function VerifyEmailPage({ onSuccess }: Props) {
  const { t } = useTranslation("app");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError(t("auth.verifyEmail.missingToken"));
      return;
    }
    (async () => {
      try {
        const res = await authApi.verifyEmail(token);
        window.history.replaceState(null, "", "/");
        onSuccess(res.token, res.expires_in, res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("auth.verifyEmail.failed"));
      }
    })();
    // Runs once against whatever token was in the URL on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Paper
      elevation={8}
      sx={{
        width: "100%",
        maxWidth: 420,
        borderRadius: 3,
        p: 4,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack spacing={3} sx={{ textAlign: "center" }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Wordmark size="lg" />
        </Box>
        {error ? (
          <Stack spacing={2} alignItems="center">
            <Alert severity="error" sx={{ width: "100%" }}>{error}</Alert>
            <Button variant="contained" onClick={() => { window.history.replaceState(null, "", "/"); window.location.reload(); }}>
              {t("auth.verifyEmail.backToSignIn")}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2} alignItems="center">
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">{t("auth.verifyEmail.verifying")}</Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

import React from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { authApi } from "../../api/auth";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import Wordmark from "../../components/Wordmark";

type Props = {
  onSuccess: (token: string, expires_in: number) => void;
  apiUp: boolean | null;
  theme: ResolvedTheme;
};

export default function LoginPage({ onSuccess, apiUp, theme }: Props) {
  const { t } = useTranslation("app");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login(username, password);
      onSuccess(res.token, res.expires_in);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("login.loginFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

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
      <Stack spacing={3} sx={{ mb: 3, textAlign: "center" }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Wordmark theme={theme} size="lg" />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {t("login.subtitle")}
        </Typography>
      </Stack>
      {apiUp === false && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t("login.apiOffline")}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <TextField
            label={t("login.usernameLabel")}
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
            fullWidth
            size="small"
          />
          <TextField
            type="password"
            label={t("login.passwordLabel")}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            size="small"
          />
          <Button type="submit" variant="contained" disabled={loading} fullWidth size="large">
            {loading ? t("login.signingIn") : t("login.signIn")}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}

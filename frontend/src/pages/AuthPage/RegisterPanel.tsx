import React from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import { authApi, type AuthUser } from "../../api/auth";
import CheckEmailPanel from "./CheckEmailPanel";

const MIN_PASSWORD_LENGTH = 8;

type Props = {
  onSuccess: (token: string, expires_in: number, user: AuthUser) => void;
  allowRegistrations: boolean;
};

export default function RegisterPanel({ onSuccess, allowRegistrations }: Props) {
  const { t } = useTranslation("app");
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Set once the backend confirms this instance requires email verification -- replaces the
  // form with CheckEmailPanel instead of ever calling onSuccess.
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.register.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.register.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.register({ displayName, email, password });
      if ("email_verification_required" in res) {
        setPendingEmail(res.email);
      } else {
        onSuccess(res.token, res.expires_in, res.user);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("auth.register.failed"));
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) {
    return <CheckEmailPanel email={pendingEmail} />;
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2}>
        {!allowRegistrations && <Alert severity="info">{t("auth.register.disabled")}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t("auth.register.displayNameLabel")}
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          autoComplete="name"
          required
          fullWidth
          size="small"
          disabled={!allowRegistrations}
        />
        <TextField
          type="email"
          label={t("auth.register.emailLabel")}
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          required
          fullWidth
          size="small"
          disabled={!allowRegistrations}
        />
        <Stack spacing={0.5}>
          <TextField
            type="password"
            label={t("auth.register.passwordLabel")}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            size="small"
            disabled={!allowRegistrations}
          />
          <Typography variant="caption" color="text.secondary">
            {t("auth.register.passwordHelp")}
          </Typography>
        </Stack>
        <TextField
          type="password"
          label={t("auth.register.confirmPasswordLabel")}
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          fullWidth
          size="small"
          disabled={!allowRegistrations}
        />
        <Button type="submit" variant="contained" disabled={loading || !allowRegistrations} fullWidth size="large">
          {loading ? t("auth.register.submitting") : t("auth.register.submit")}
        </Button>
      </Stack>
    </Box>
  );
}

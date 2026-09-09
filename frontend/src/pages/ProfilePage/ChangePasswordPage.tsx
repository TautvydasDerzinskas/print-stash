import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import SectionHeader from "../../components/SectionHeader";
import { authApi } from "../../api/auth";
import { UnauthorizedError } from "../../api/client";

const MIN_PASSWORD_LENGTH = 8;

type Props = {
  onUnauthorized?: () => void;
};

export default function ChangePasswordPage({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.register.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.register.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await authApi.updateProfile({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus(t("profile.passwordUpdated"));
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error ? err.message : t("profile.genericError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 420 }}>
      <SectionHeader
        title={t("profile.changePasswordTitle")}
        subtitle={t("profile.changePasswordSubtitle")}
        onBack={() => navigate("/profile")}
        backLabel={t("profile.backToProfile")}
      />

      {status && <Alert severity="success" onClose={() => setStatus(null)}>{status}</Alert>}
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <TextField
            type="password"
            label={t("profile.currentPasswordLabel")}
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            size="small"
          />
          <TextField
            type="password"
            label={t("profile.newPasswordLabel")}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
            helperText={t("auth.register.passwordHelp")}
            required
            fullWidth
            size="small"
          />
          <TextField
            type="password"
            label={t("profile.confirmNewPasswordLabel")}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            size="small"
          />
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? t("profile.saving") : t("profile.savePassword")}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

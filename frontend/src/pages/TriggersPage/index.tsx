import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import { UnauthorizedError } from "../../api/client";
import { adminApi, type AdminUser } from "../../api/admin";

type Props = {
  onUnauthorized?: () => void;
};

/** Admin-only "trigger" actions -- one-off, high-blast-radius operations run against another
 *  user's data. Today there's a single trigger (delete all of a user's models); this file
 *  intentionally stays a plain list of Paper sections rather than a generic "trigger registry"
 *  until there's a second one to justify the abstraction. */
export default function TriggersPage({ onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await adminApi.listUsers());
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setError(t("adminSettings.triggers.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, t]);

  React.useEffect(() => { void loadUsers(); }, [loadUsers]);

  const selectedUser = users.find(u => u.id === selectedUserId) || null;

  const openConfirm = () => {
    if (!selectedUser) return;
    setConfirmText("");
    setError(null);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (deleting) return;
    setConfirmOpen(false);
  };

  const confirmMatches = Boolean(selectedUser) && confirmText.trim().toLowerCase() === selectedUser?.email.toLowerCase();

  const handleDelete = async () => {
    if (!selectedUser || !confirmMatches) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await adminApi.deleteAllPrintsForUser(selectedUser.id);
      setStatus(t("adminSettings.triggers.deleteSuccess", { count: result.deleted, email: selectedUser.email }));
      setConfirmOpen(false);
      await loadUsers();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error ? err.message : t("adminSettings.triggers.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              {t("adminSettings.triggers.deleteAllTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("adminSettings.triggers.deleteAllDesc")}
            </Typography>
          </Box>

          {loading ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 300 }}>
                <InputLabel id="trigger-user-select-label">{t("adminSettings.triggers.userLabel")}</InputLabel>
                <Select
                  labelId="trigger-user-select-label"
                  label={t("adminSettings.triggers.userLabel")}
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  disabled={deleting}
                >
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      {t("adminSettings.triggers.userOption", { name: u.display_name, email: u.email, count: u.print_count })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                color="error"
                disabled={!selectedUser || !selectedUser.print_count || deleting}
                onClick={openConfirm}
              >
                {t("adminSettings.triggers.deleteAllButton")}
              </Button>
            </Stack>
          )}

          {status && <Alert severity="success" onClose={() => setStatus(null)}>{status}</Alert>}
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        </Stack>
      </Paper>

      <Dialog open={confirmOpen} onClose={closeConfirm} maxWidth="sm" fullWidth>
        <DialogTitle>{t("adminSettings.triggers.confirmTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {selectedUser && (
              <Alert severity="warning">
                {t("adminSettings.triggers.confirmWarning", {
                  count: selectedUser.print_count,
                  email: selectedUser.email,
                })}
              </Alert>
            )}
            <DialogContentText>
              {selectedUser && t("adminSettings.triggers.confirmInstructions", { email: selectedUser.email })}
            </DialogContentText>
            <TextField
              fullWidth
              size="small"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={selectedUser?.email}
              disabled={deleting}
              // Deliberate: focus the confirmation field the moment the dialog opens.
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirm} disabled={deleting}>{t("common:cancel")}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={!confirmMatches || deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {deleting ? t("adminSettings.triggers.deleting") : t("adminSettings.triggers.confirmButton")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

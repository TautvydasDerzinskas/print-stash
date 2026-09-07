import React from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";

export type ConfirmOptions = {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for actions that delete or otherwise can't be undone. */
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & { resolve: (result: boolean) => void };

const ConfirmContext = React.createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/** App-wide replacement for `window.confirm` -- a single MUI Dialog instance shared by every
 *  caller, so a destructive action anywhere just does `await confirm({ message, destructive: true })`
 *  instead of wiring up its own modal. Mounted once in AppLayout. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("common");
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(pending)} onClose={() => settle(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{pending?.title || t("confirm")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{pending?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => settle(false)}>{pending?.cancelLabel || t("cancel")}</Button>
          <Button
            variant="contained"
            color={pending?.destructive ? "error" : "primary"}
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel || (pending?.destructive ? t("delete") : t("confirm"))}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Returns a function that opens the shared confirm dialog and resolves true/false with the
 *  user's choice -- `if (!(await confirm({ message: "..." }))) return;` in place of
 *  `if (!confirm("...")) return;`. */
export function useConfirm() {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within a ConfirmProvider");
  return confirm;
}

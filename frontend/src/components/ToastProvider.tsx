import React from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert, { type AlertColor } from "@mui/material/Alert";

export type ToastOptions = {
  message: string;
  severity?: AlertColor;
};

type QueuedToast = ToastOptions & { key: number };

const ToastContext = React.createContext<((options: ToastOptions) => void) | null>(null);

let nextKey = 0;

/** App-wide toast/snackbar, mirroring ConfirmProvider's single-instance-shared-by-every-caller
 *  shape: `showToast({ message, severity })` in place of wiring up a Snackbar per component.
 *  Mounted once in AppLayout. Queues toasts one at a time (MUI's own recommended pattern for
 *  consecutive Snackbars) instead of stacking or dropping one that fires while another is
 *  still showing. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<QueuedToast[]>([]);
  const [current, setCurrent] = React.useState<QueuedToast | null>(null);
  const [open, setOpen] = React.useState(false);

  const showToast = React.useCallback((options: ToastOptions) => {
    setQueue(prev => [...prev, { ...options, key: nextKey++ }]);
  }, []);

  React.useEffect(() => {
    if (queue.length && !current) {
      setCurrent(queue[0]);
      setQueue(prev => prev.slice(1));
      setOpen(true);
    } else if (queue.length && current && open) {
      setOpen(false);
    }
  }, [queue, current, open]);

  const handleClose = (_event: unknown, reason?: string) => {
    if (reason === "clickaway") return;
    setOpen(false);
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <Snackbar
        key={current?.key}
        open={open}
        autoHideDuration={4000}
        onClose={handleClose}
        slotProps={{ transition: { onExited: () => setCurrent(null) } }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setOpen(false)} severity={current?.severity ?? "success"} variant="filled" sx={{ width: "100%" }}>
          {current?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

/** Returns a function that queues a toast -- `showToast({ message: "..." })`. */
export function useToast() {
  const showToast = React.useContext(ToastContext);
  if (!showToast) throw new Error("useToast must be used within a ToastProvider");
  return showToast;
}

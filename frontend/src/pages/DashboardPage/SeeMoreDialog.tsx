import React from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

type Props<T> = {
  open: boolean;
  onClose: () => void;
  title: string;
  emptyText: string;
  fetcher: () => Promise<T[]>;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
};

/** Shared "see more" dialog behind every list card's See more button -- fetches an expanded
 *  (but still capped) version of that card's list lazily, only once opened. Generic over the row
 *  type so ModelListCard and AuthorListCard can reuse it with their own row rendering. */
export default function SeeMoreDialog<T>({ open, onClose, title, emptyText, fetcher, getKey, renderItem }: Props<T>) {
  const { t } = useTranslation("common");
  const [items, setItems] = React.useState<T[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setItems(null);
    setError(null);
    fetcher()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    // Only re-fetch when the dialog opens, not on every render (fetcher isn't stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: 480 }}>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : items === null ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : items.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>{emptyText}</Typography>
        ) : (
          <List dense disablePadding>
            {items.map((item, index) => (
              <React.Fragment key={getKey(item)}>{renderItem(item, index)}</React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

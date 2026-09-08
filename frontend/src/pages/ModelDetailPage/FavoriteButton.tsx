import { useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { UnauthorizedError } from "../../api/client";
import { type Print, printsApi } from "../../api/prints";

type Props = {
  print: Print;
  onUpdated: (print: Print) => void;
  onUnauthorized?: () => void;
};

/** The model detail page's header favourite toggle -- adds/removes the print from the built-in
 *  "Favourites" pseudo-collection (see backend/src/services/collectionService.ts). */
export default function FavoriteButton({ print, onUpdated, onUnauthorized }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = print.is_favorite ? await printsApi.unfavorite(print.id) : await printsApi.favorite(print.id);
      onUpdated(updated);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      alert(t("models:detail.favoriteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const label = print.is_favorite ? t("models:detail.removeFromFavorites") : t("models:detail.addToFavorites");

  return (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" onClick={toggle} disabled={busy} aria-label={label ?? undefined}>
          {busy ? (
            <CircularProgress size={18} />
          ) : print.is_favorite ? (
            <FavoriteIcon fontSize="small" color="error" />
          ) : (
            <FavoriteBorderIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}

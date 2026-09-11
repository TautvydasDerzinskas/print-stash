import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "@mui/material/Tooltip";
import { UnauthorizedError } from "../../api/client";
import { type Print, printsApi } from "../../api/prints";
import StarToggle from "../../components/StarToggle";

type Props = {
  print: Print;
  onUpdated: (print: Print) => void;
  onUnauthorized?: () => void;
};

/** The model detail page's header favourite toggle -- adds/removes the print from the built-in
 *  "Favourites" pseudo-collection (see backend/src/services/collectionService.ts). Flips its own
 *  local state immediately on click (optimistic, rolled back on failure) instead of waiting on
 *  the request and swapping in a spinner meanwhile -- StarToggle's burst animation only plays on
 *  an actual false->true prop transition while mounted, so hiding it behind a spinner for the
 *  request's duration (and remounting it already-flipped once the response lands) skipped the
 *  animation entirely. */
export default function FavoriteButton({ print, onUpdated, onUnauthorized }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [isFavorite, setIsFavorite] = useState(print.is_favorite);
  const pendingRef = useRef(false);

  useEffect(() => { setIsFavorite(print.is_favorite); }, [print.is_favorite]);

  const toggle = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      const updated = next ? await printsApi.favorite(print.id) : await printsApi.unfavorite(print.id);
      onUpdated(updated);
    } catch (err) {
      setIsFavorite(!next);
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      alert(t("models:detail.favoriteFailed"));
    } finally {
      pendingRef.current = false;
    }
  };

  const label = isFavorite ? t("models:detail.removeFromFavorites") : t("models:detail.addToFavorites");

  return (
    <Tooltip title={label}>
      <span>
        <StarToggle active={isFavorite} onClick={toggle} ariaLabel={label} size={26} />
      </span>
    </Tooltip>
  );
}

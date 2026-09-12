import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import { type Print, printsApi } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { UnauthorizedError } from "../../api/client";
import { useToast } from "../../components/ToastProvider";
import { renderPreviewContent } from "../../components/media/renderPreviewContent";
import { importProviderInfo } from "../../constants/importProviders";
import StarToggle from "../../components/StarToggle";
import ModelActionsMenu from "../ModelDetailPage/ModelActionsMenu";

type Props = {
  item: Print;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  onDeleted?: (id: string) => void;
  onFavoriteChange?: (print: Print) => void;
  onUnauthorized?: () => void;
  /** Set only by CollectionDetailPage, and only for a real (non-system) collection -- shows
   *  "Remove from collection" in the card's "..." menu. See ModelActionsMenu's doc comment. */
  collectionId?: string;
  onRemovedFromCollection?: (id: string) => void;
};

// No solid backdrop behind the hover-overlay icons (a card's thumbnail can be any color) -- a
// drop-shadow keeps them legible against light and dark images alike without boxing them in.
const hoverIconShadow = { filter: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.85))" };
const HOVER_ICON_SIZE = 26;

export default function ModelCard({
  item,
  theme,
  previewMode,
  onDeleted,
  onFavoriteChange,
  onUnauthorized,
  collectionId,
  onRemovedFromCollection,
}: Props) {
  const { t } = useTranslation(["models", "common"]);
  const navigate = useNavigate();
  const showToast = useToast();
  // Flips immediately on click (optimistic, rolled back on failure) instead of waiting on the
  // request behind a spinner -- StarToggle's burst animation only plays on an actual
  // false->true prop transition while mounted, so swapping it for a spinner mid-request (then
  // remounting it already-flipped once the response lands) skipped the animation entirely.
  const [isFavorite, setIsFavorite] = useState(item.is_favorite);
  const favoritePendingRef = useRef(false);
  const author = item.author;
  const authorName = author?.name || author?.handle || item.creator || null;
  const providerInfo = importProviderInfo(item.source_provider);

  useEffect(() => { setIsFavorite(item.is_favorite); }, [item.is_favorite]);

  const toggleFavorite = async () => {
    if (favoritePendingRef.current) return;
    favoritePendingRef.current = true;
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      const updated = next ? await printsApi.favorite(item.id) : await printsApi.unfavorite(item.id);
      onFavoriteChange?.(updated);
      showToast({
        message: t(updated.is_favorite ? "models:card.addedToFavorites" : "models:card.removedFromFavorites", {
          name: updated.title || updated.name,
        }),
      });
    } catch (err) {
      setIsFavorite(!next);
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      console.error(err);
      showToast({ message: t("models:detail.favoriteFailed"), severity: "error" });
    } finally {
      favoritePendingRef.current = false;
    }
  };

  const favoriteLabel = isFavorite ? t("models:detail.removeFromFavorites") : t("models:detail.addToFavorites");

  return (
    <Paper
      variant="outlined"
      onClick={() => navigate(`/models/${item.id}`)}
      sx={{
        position: "relative",
        cursor: "pointer",
        overflow: "hidden",
        borderRadius: "12px",
        borderColor: "transparent",
        bgcolor: (muiTheme) => (muiTheme.palette.mode === "dark" ? muiTheme.thingport.pageBackground : muiTheme.palette.grey[100]),
        transition: "background-color .15s ease, box-shadow .15s ease, transform .15s ease",
        "&:hover": {
          bgcolor: "background.paper",
          boxShadow: 6,
          borderColor: "divider",
          transform: "translateY(-2px)",
        },
        "&:hover .model-card-actions": { opacity: 1 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          aspectRatio: "4 / 3",
          bgcolor: (muiTheme) => (muiTheme.palette.mode === "dark" ? muiTheme.thingport.pageBackground : muiTheme.palette.grey[200]),
        }}
      >
        {renderPreviewContent(item, "card", theme, t, previewMode)}
      </Box>

      {providerInfo && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            px: 1,
            py: 0.375,
            borderRadius: 1,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.4,
            color: "#fff",
            bgcolor: providerInfo.color,
          }}
        >
          {providerInfo.label}
        </Box>
      )}

      <Stack
        className="model-card-actions"
        direction="row"
        spacing={0.5}
        onClick={e => e.stopPropagation()}
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          opacity: 0,
          transition: "opacity .15s ease",
        }}
      >
        <Tooltip title={favoriteLabel}>
          <Box>
            <StarToggle
              active={isFavorite}
              onClick={toggleFavorite}
              ariaLabel={favoriteLabel}
              inactiveColor="#fff"
              size={HOVER_ICON_SIZE}
              sx={hoverIconShadow}
            />
          </Box>
        </Tooltip>
        <ModelActionsMenu
          print={item}
          onUnauthorized={onUnauthorized}
          onDeleted={() => onDeleted?.(item.id)}
          collectionId={collectionId}
          onRemovedFromCollection={() => onRemovedFromCollection?.(item.id)}
          triggerSx={{ color: "#fff", ...hoverIconShadow }}
          iconFontSize={HOVER_ICON_SIZE}
        />
      </Stack>
      <Box sx={{ p: 1.5 }}>
        <Typography variant="body2" fontWeight={600} noWrap title={item.title || item.name}>
          {item.title || item.name}
        </Typography>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{
              minWidth: 0,
              color: "#858585",
              ...(author ? { cursor: "pointer", "&:hover": { color: "#00b800" } } : undefined),
            }}
            onClick={e => {
              if (!author) return;
              e.stopPropagation();
              navigate(`/authors/${author.id}`);
            }}
          >
            <Avatar src={author?.avatar_url || undefined} sx={{ width: 20, height: 20, fontSize: 11, color: "inherit !important" }}>
              {(authorName || "?").slice(0, 1).toUpperCase()}
            </Avatar>
            <Typography variant="caption" noWrap sx={{ color: "inherit" }}>
              {authorName || t("models:card.unknownAuthor")}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ color: "#858585", flexShrink: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.4}>
              <VisibilityIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">{item.view_count}</Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={0.4}>
              <PrintIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">{item.print_count}</Typography>
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}

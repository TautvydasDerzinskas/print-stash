import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { UnauthorizedError } from "../../api/client";
import { type Print, printsApi } from "../../api/prints";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { MODEL_EXTS } from "../../constants/fileTypes";
import { extOf } from "../../utils/fileExtensions";
import { renderPreviewContent } from "../../components/media/renderPreviewContent";
import { ModelSnapshot } from "../../components/media/ModelViewer/ModelSnapshot";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import Model3DPreviewModal from "./Model3DPreviewModal";
import ModelActionsMenu from "./ModelActionsMenu";

type Props = {
  theme: ResolvedTheme;
  onUnauthorized?: () => void;
};

export default function ModelDetailPage({ theme, onUnauthorized }: Props) {
  const { printId } = useParams<{ printId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(["models", "common", "library"]);
  const [print, setPrint] = useState<Print | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Back always returns wherever the user came from (the models grid, filtered to whichever
  // folder they'd selected, or an author page) -- browser history already carries that, so this
  // is also what a post-delete redirect below reuses.
  const goBack = () => navigate(-1);

  usePageHeader({
    title: print ? (print.title || print.name) : undefined,
    actions: print ? (
      <ModelActionsMenu print={print} onUnauthorized={onUnauthorized} onDeleted={goBack} />
    ) : undefined,
  });

  useEffect(() => {
    if (!printId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const data = await printsApi.get(printId);
        if (cancelled) return;
        setPrint(data);
        setActiveImageIndex(0);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          onUnauthorized?.();
          return;
        }
        console.error(err);
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [printId, onUnauthorized]);

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress size={22} />
      </Stack>
    );
  }

  if (notFound || !print) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 8, color: "text.secondary" }}>
        <Typography variant="body2">{t("models:errors.notFound")}</Typography>
      </Stack>
    );
  }

  const images = print.preview_images.toSorted((a, b) => a.position - b.position);
  const hasImages = images.length > 0;
  const activeImage = images[activeImageIndex] || images[0];
  const authorName = print.author?.name || print.author?.handle || print.creator || null;
  const firstPlate = print.plates[0];
  const canPreview3d = Boolean(firstPlate) && MODEL_EXTS.has(extOf(firstPlate?.filename || ""));
  // Every model should end up with at least one preview image -- an import brings its own cover
  // photo, but a plain file upload has nothing to show until one is generated. When there isn't
  // one yet, render the live 3D view as a visible fallback *and* (invisibly) let the same
  // snapshot pipeline the grid cards use generate + upload one in the background, so this page
  // shows something useful immediately and self-heals on the next visit.
  const needsGeneratedPreview = !hasImages && Boolean(firstPlate) && MODEL_EXTS.has(extOf(firstPlate?.filename || ""));

  const goPrevImage = () => setActiveImageIndex(i => (i - 1 + images.length) % images.length);
  const goNextImage = () => setActiveImageIndex(i => (i + 1) % images.length);

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 2, width: "fit-content", cursor: print.author ? "pointer" : "default" }}
        onClick={() => print.author && navigate(`/authors/${print.author.id}`)}
      >
        <Avatar src={print.author?.avatar_url || undefined} sx={{ width: 28, height: 28, fontSize: 13 }}>
          {(authorName || "?").slice(0, 1).toUpperCase()}
        </Avatar>
        <Typography variant="body2" sx={print.author ? { "&:hover": { textDecoration: "underline" } } : undefined}>
          {authorName || t("models:card.unknownAuthor")}
        </Typography>
      </Stack>

      <Box sx={{ position: "relative", width: "100%", aspectRatio: "16 / 10", borderRadius: "12px", overflow: "hidden", bgcolor: "action.hover" }}>
        {hasImages ? (
          <Box
            component="img"
            src={printsApi.fileUrl(activeImage.url)}
            alt={print.title || print.name}
            sx={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          firstPlate && renderPreviewContent(print, "modal", theme, t, "automatic", firstPlate)
        )}

        {images.length > 1 && (
          <>
            <IconButton
              onClick={goPrevImage}
              aria-label={t("models:detail.previousImage") ?? undefined}
              sx={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                bgcolor: "rgba(0, 0, 0, 0.45)",
                color: "#fff",
                "&:hover": { bgcolor: "rgba(0, 0, 0, 0.65)" },
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={goNextImage}
              aria-label={t("models:detail.nextImage") ?? undefined}
              sx={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                bgcolor: "rgba(0, 0, 0, 0.45)",
                color: "#fff",
                "&:hover": { bgcolor: "rgba(0, 0, 0, 0.65)" },
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}

        {canPreview3d && (
          <Button
            variant="contained"
            size="small"
            startIcon={<ViewInArIcon fontSize="small" />}
            onClick={() => setPreviewOpen(true)}
            sx={{
              position: "absolute",
              left: 12,
              bottom: 12,
              bgcolor: "rgba(0, 0, 0, 0.65)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(0, 0, 0, 0.8)" },
            }}
          >
            {t("models:detail.preview3d")}
          </Button>
        )}
      </Box>

      {images.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, overflowX: "auto", pb: 0.5 }}>
          {images.map((image, idx) => (
            <ButtonBase
              key={image.id}
              onClick={() => setActiveImageIndex(idx)}
              sx={{
                width: 84,
                height: 64,
                borderRadius: 1.5,
                overflow: "hidden",
                border: "2px solid",
                borderColor: idx === activeImageIndex ? "primary.main" : "divider",
                flexShrink: 0,
              }}
            >
              <Box
                component="img"
                src={printsApi.fileUrl(image.url)}
                alt=""
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </ButtonBase>
          ))}
        </Stack>
      )}

      {needsGeneratedPreview && firstPlate && (
        <Box sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }} aria-hidden="true">
          <ModelSnapshot
            url={printsApi.fileUrl(firstPlate.url)}
            ext={extOf(firstPlate.filename)}
            plateId={firstPlate.id}
            theme={theme}
            mode="automatic"
          />
        </Box>
      )}

      <Paper variant="outlined" sx={{ mt: 3, p: 2, borderRadius: "12px" }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>{t("models:detail.description")}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: print.notes ? "text.primary" : "text.disabled" }}>
          {print.notes || t("models:detail.noDescription")}
        </Typography>

        <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2.5, mb: 1 }}>{t("models:detail.tags")}</Typography>
        {print.tags.length ? (
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
            {print.tags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                variant="outlined"
                sx={{ bgcolor: "background.paper", borderColor: "divider", color: "text.primary" }}
              />
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.disabled">{t("models:detail.noTags")}</Typography>
        )}
      </Paper>

      {previewOpen && <Model3DPreviewModal print={print} onClose={() => setPreviewOpen(false)} />}
    </Box>
  );
}

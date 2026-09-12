import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import CircularProgress from "@mui/material/CircularProgress";
import PersonIcon from "@mui/icons-material/Person";
import { UnauthorizedError } from "../../api/client";
import { authorsApi, type Author } from "../../api/authors";
import { type Print, printsApi } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { importProviderInfo } from "../../constants/importProviders";
import { authorProfileUrl } from "../../utils/authorProfileUrl";
import ModelCard from "../ModelsPage/ModelCard";

const PAGE_SIZE = 24;
const COVER_HEIGHT = 184;

type Props = {
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  onUnauthorized?: () => void;
};

/** An author's own page: a cover strip, then a narrow profile column (avatar, name, @handle, a
 *  provider chip linking back to their profile on the site they were imported from, and their
 *  bio) beside a wide "Models" grid of every print by them this user has imported -- the models
 *  route's own grid pattern, reused as-is via ModelCard. The whole thing reads as a page of its
 *  own, sidebar-colored and border-free, sitting inside the app shell rather than blending into
 *  it. Author rows are shared across users (not scoped to this account -- see
 *  authorService.ts's doc comment on the backend), so there's nothing here to edit. */
export default function AuthorPage({ theme, previewMode, onUnauthorized }: Props) {
  const { authorId } = useParams<{ authorId: string }>();
  const { t } = useTranslation(["models", "common"]);
  const [author, setAuthor] = useState<Author | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [items, setItems] = useState<Print[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const displayName = author?.name || author?.handle || t("models:card.unknownAuthor");

  // Only overrides the title -- the route's own default onBack (see AppLayout's useRouteChrome,
  // "/authors/" -> navigate(-1)) already does exactly "back button goes to the previous page".
  usePageHeader({
    title: author ? t("models:author.pageTitleWithName", { name: displayName }) : undefined,
  });

  const handleError = (err: unknown, message?: string) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return true;
    }
    console.error(err);
    if (message) alert(message);
    return false;
  };

  useEffect(() => {
    if (!authorId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const [authorResult, printsResult] = await Promise.all([
          authorsApi.get(authorId),
          printsApi.list({ author_id: authorId, limit: PAGE_SIZE, offset: 0 }),
        ]);
        if (cancelled) return;
        setAuthor(authorResult);
        setItems(printsResult.items);
        setOffset(printsResult.items.length);
        setHasMore(printsResult.hasMore);
      } catch (err) {
        if (cancelled) return;
        if (handleError(err)) return;
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !authorId) return;
    setLoadingMore(true);
    try {
      const result = await printsApi.list({ author_id: authorId, limit: PAGE_SIZE, offset });
      setItems(prev => [...prev, ...result.items]);
      setOffset(offset + result.items.length);
      setHasMore(result.hasMore);
    } catch (err) {
      handleError(err, t("models:errors.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreSentinelRef = useInfiniteScroll(loadMore, hasMore, loading || loadingMore);

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress size={22} />
      </Stack>
    );
  }

  if (notFound || !author) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 8, color: "text.secondary" }}>
        <Typography variant="body2">{t("models:author.notFound")}</Typography>
      </Stack>
    );
  }

  const providerInfo = importProviderInfo(author.provider);
  const profileUrl = authorProfileUrl(author);
  const bioText = author.bio || author.bio_translated;

  return (
    <Box sx={{ maxWidth: "1920px", mx: "auto", bgcolor: "background.paper", borderRadius: "12px", overflow: "hidden" }}>
      <Box
        sx={{
          height: `${COVER_HEIGHT}px`,
          bgcolor: "action.hover",
          ...(author.background_url && {
            // Quoted, not a bare url(...) -- an unquoted CSS url() treats the first unescaped ")"
            // as its terminator, which a data: URI (or any URL containing one) would break.
            backgroundImage: `url("${author.background_url}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }),
        }}
      />

      <Box sx={{ p: 3 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "320px 1fr" },
            gap: "32px",
            alignItems: "start",
          }}
        >
          <Box>
            <Avatar src={author.avatar_url ?? undefined} sx={{ width: 112, height: 112, fontSize: 40 }}>
              <PersonIcon fontSize="large" />
            </Avatar>
            <Typography variant="h5" fontWeight={700} sx={{ mt: 2 }}>{displayName}</Typography>
            {author.handle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>@{author.handle}</Typography>
            )}
            {providerInfo && profileUrl && (
              <Box
                component="a"
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={t("models:author.viewOnProvider", { provider: providerInfo.label })}
                sx={{
                  display: "inline-block",
                  mt: 1.5,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.6,
                  color: "#fff",
                  textDecoration: "none",
                  bgcolor: providerInfo.color,
                }}
              >
                {providerInfo.label}
              </Box>
            )}

            <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 3, mb: 1 }}>{t("models:author.bio")}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: bioText ? "text.primary" : "text.disabled" }}>
              {bioText || t("models:author.noBio")}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t("models:pageTitle")}</Typography>
            {items.length ? (
              <Stack spacing={2}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    columnGap: "20px",
                    rowGap: "20px",
                    "@media (max-width: 1684px)": { gridTemplateColumns: "repeat(4, 1fr)" },
                    "@media (max-width: 1404px)": { gridTemplateColumns: "repeat(3, 1fr)" },
                    "@media (max-width: 1124px)": { gridTemplateColumns: "repeat(2, 1fr)" },
                    "@media (max-width: 860px)": { gridTemplateColumns: "repeat(1, 1fr)" },
                  }}
                >
                  {items.map(item => (
                    <ModelCard
                      key={item.id}
                      item={item}
                      theme={theme}
                      previewMode={previewMode}
                      onDeleted={deletedId => setItems(prev => prev.filter(i => i.id !== deletedId))}
                      onFavoriteChange={updated => setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))}
                      onUpdated={updated => setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))}
                      onUnauthorized={onUnauthorized}
                    />
                  ))}
                </Box>
                {hasMore && (
                  <Stack ref={loadMoreSentinelRef} direction="row" justifyContent="center" sx={{ py: 1 }}>
                    {loadingMore && (
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
                        <CircularProgress size={14} />
                        <Typography variant="caption">{t("models:grid.loadingMore")}</Typography>
                      </Stack>
                    )}
                  </Stack>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">{t("models:author.noModels")}</Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

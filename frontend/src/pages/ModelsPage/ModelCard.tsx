import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import { type Print } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { renderPreviewContent } from "../../components/media/renderPreviewContent";

type Props = {
  item: Print;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
};

export default function ModelCard({ item, theme, previewMode }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const navigate = useNavigate();
  const author = item.author;
  const authorName = author?.name || author?.handle || item.creator || null;

  return (
    <Paper
      variant="outlined"
      onClick={() => navigate(`/models/${item.id}`)}
      sx={{
        cursor: "pointer",
        overflow: "hidden",
        borderRadius: "12px",
        borderColor: "transparent",
        bgcolor: (muiTheme) => (muiTheme.palette.mode === "dark" ? muiTheme.palette.grey[800] : muiTheme.palette.grey[100]),
        transition: "background-color .15s ease, box-shadow .15s ease, transform .15s ease",
        "&:hover": {
          bgcolor: "background.paper",
          boxShadow: 6,
          borderColor: "divider",
          transform: "translateY(-2px)",
        },
      }}
    >
      <Box
        sx={{
          width: "100%",
          aspectRatio: "4 / 3",
          bgcolor: (muiTheme) => (muiTheme.palette.mode === "dark" ? muiTheme.palette.grey[900] : muiTheme.palette.grey[200]),
        }}
      >
        {renderPreviewContent(item, "card", theme, t, previewMode)}
      </Box>
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

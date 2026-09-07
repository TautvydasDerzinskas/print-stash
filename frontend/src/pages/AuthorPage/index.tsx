import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PersonIcon from "@mui/icons-material/Person";

// TODO: real author profile (avatar, bio, links, their models) once the backend exposes a
// GET /author/:id endpoint. For now this just gives the route somewhere to go.
export default function AuthorPage() {
  const { t } = useTranslation("models");
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 10, color: "text.secondary" }}>
      <PersonIcon sx={{ fontSize: 40 }} />
      <Typography variant="body2">{t("models:author.comingSoon")}</Typography>
    </Stack>
  );
}

import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import ResendVerificationButton from "./ResendVerificationButton";

type Props = {
  email: string;
};

/** Shown in place of the registration form right after signing up on an instance with SMTP
 *  configured -- the account exists but can't sign in until the emailed link is clicked. */
export default function CheckEmailPanel({ email }: Props) {
  const { t } = useTranslation("app");

  return (
    <Stack spacing={2} alignItems="center" sx={{ textAlign: "center", py: 1 }}>
      <MarkEmailReadIcon sx={{ fontSize: 40, color: "primary.main" }} />
      <Typography variant="h6">{t("auth.checkEmail.heading")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t("auth.checkEmail.body", { email })}
      </Typography>
      <ResendVerificationButton email={email} />
    </Stack>
  );
}

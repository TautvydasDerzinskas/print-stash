import React from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { authApi } from "../../api/auth";

type Props = {
  email: string;
};

type State = "idle" | "sending" | "sent" | "error";

/** Shared "Resend verification email" affordance -- used both right after registering
 *  (CheckEmailPanel) and when a sign-in attempt is blocked because the account isn't verified
 *  yet (SignInPanel). The backend's response is always the same generic message regardless of
 *  whether the account exists or is already verified, so there's nothing more specific to show
 *  here even on failure. */
export default function ResendVerificationButton({ email }: Props) {
  const { t } = useTranslation("app");
  const [state, setState] = React.useState<State>("idle");

  const handleClick = async () => {
    setState("sending");
    try {
      await authApi.resendVerification(email);
      setState("sent");
    } catch {
      setState("error");
    }
  };

  if (state === "sent") {
    return <Typography variant="body2" color="success.main">{t("auth.checkEmail.resent")}</Typography>;
  }

  return (
    <Button
      variant="outlined"
      size="small"
      onClick={handleClick}
      disabled={state === "sending"}
      startIcon={state === "sending" ? <CircularProgress size={14} /> : undefined}
    >
      {state === "sending"
        ? t("auth.checkEmail.resending")
        : state === "error"
          ? t("auth.checkEmail.resendFailed")
          : t("auth.checkEmail.resendButton")}
    </Button>
  );
}

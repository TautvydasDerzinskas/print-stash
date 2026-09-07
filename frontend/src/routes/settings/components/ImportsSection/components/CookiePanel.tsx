import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";

type Props = {
  cookie: string;
  onSave: (cookie: string) => void;
  headingText: string;
  descText: string;
  helpText: string;
  placeholderText?: string;
};

/** A labeled session-cookie textarea with an edit/save toggle -- shared by the MakerWorld and
 *  Thingiverse import-auth panels, which are otherwise identical apart from their copy. */
export default function CookiePanel({ cookie, onSave, headingText, descText, helpText, placeholderText }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [draft, setDraft] = React.useState(cookie || "");
  const [editing, setEditing] = React.useState(!cookie);

  React.useEffect(() => {
    if (!editing) setDraft(cookie || "");
  }, [cookie, editing]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>{headingText}</Typography>
          <Typography variant="body2" color="text.secondary">{descText}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {helpText}
        </Typography>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("settings.imports.sessionCookieLabel")}
          </Typography>
          {editing ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => { onSave(draft); setEditing(false); }}
            >
              {t("common:save")}
            </Button>
          ) : (
            <Button size="small" variant="outlined" onClick={() => setEditing(true)}>
              {t("common:edit")}
            </Button>
          )}
        </Stack>
        <TextField
          multiline
          minRows={4}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholderText}
          InputProps={{ readOnly: !editing }}
          sx={{ opacity: editing ? 1 : 0.7 }}
        />
      </Stack>
    </Paper>
  );
}

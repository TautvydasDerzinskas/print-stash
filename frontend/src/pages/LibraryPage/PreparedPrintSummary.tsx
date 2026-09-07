import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { type PreparedPrint } from "../../api/prints";
import { formatPreparedDuration } from "../../utils/duration";

// Shared by PrintCard (card-level prepared-print banner) and PrintPreviewModal (header banner).
export default function PreparedPrintSummary({
  prepared,
  onClear,
  clearing = false,
}: {
  prepared: PreparedPrint;
  onClear?: () => void;
  clearing?: boolean;
}) {
  const { t } = useTranslation(["library"]);
  const details = [
    prepared.material,
    prepared.nozzle_mm ? `${prepared.nozzle_mm} mm` : null,
    formatPreparedDuration(t, prepared.estimated_seconds),
  ].filter(Boolean);
  return (
    <Alert
      severity="success"
      variant="outlined"
      sx={{ py: 0.25, alignItems: "center" }}
      action={
        onClear ? (
          <Button size="small" color="inherit" onClick={onClear} disabled={clearing}>
            {clearing ? t("library:preparedPrint.clearing") : t("library:preparedPrint.clear")}
          </Button>
        ) : undefined
      }
    >
      <Typography variant="caption">
        <strong>
          {prepared.printer
            ? t("library:preparedPrint.preparedFor", { printer: prepared.printer })
            : t("library:preparedPrint.available")}
        </strong>
        {details.length > 0 && <> · {details.join(" · ")}</>}
      </Typography>
    </Alert>
  );
}

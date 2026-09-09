import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

type Props = {
  icon: React.ReactNode;
  count: number;
  label: string;
  onClick?: () => void;
};

/** A single stat card in the dashboard's first column (Collections/Models/Authors/Categories).
 *  When `onClick` is given, the whole card is a link -- hover background + pointer cursor are
 *  the only affordance, no arrow icon, matching youtube-mp3-vault's dashboard count cards.
 *  Omitting `onClick` (Authors, for now) renders a plain static card. */
export default function CountCard({ icon, count, label, onClick }: Props) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 1,
        minHeight: 140,
        ...(onClick && {
          cursor: "pointer",
          transition: (theme) => theme.transitions.create("background-color", { duration: theme.transitions.duration.shortest }),
          "&:hover": { bgcolor: "action.hover" },
        }),
      }}
    >
      <Typography component="div" sx={{ color: "primary.main", display: "flex" }}>{icon}</Typography>
      <Typography variant="h3" fontWeight={700}>{count}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Paper>
  );
}

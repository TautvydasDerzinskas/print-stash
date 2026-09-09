import React from "react";
import { useNavigate } from "react-router-dom";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@mui/material/Avatar";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import { printsApi } from "../../api/prints";
import type { DashboardModel } from "../../api/dashboard";
import SeeMoreDialog from "./SeeMoreDialog";

type Props = {
  icon: React.ReactNode;
  title: string;
  models: DashboardModel[];
  valueOf: (model: DashboardModel) => number;
  valueLabel: (count: number) => string;
  emptyText: string;
  seeMoreLabel: string;
  fetchMore: () => Promise<DashboardModel[]>;
};

function ModelRow({ model, rank, valueOf, valueLabel, onClick }: {
  model: DashboardModel;
  rank: number;
  valueOf: (model: DashboardModel) => number;
  valueLabel: (count: number) => string;
  onClick: () => void;
}) {
  return (
    <ListItemButton onClick={onClick} sx={{ borderRadius: 1, px: 1 }}>
      <Typography sx={{ width: 24, flexShrink: 0, color: "text.secondary", fontWeight: 600 }}>{rank}</Typography>
      <ListItemAvatar sx={{ minWidth: 48 }}>
        <Avatar src={model.thumb_url ? printsApi.fileUrl(model.thumb_url) : undefined} variant="rounded" sx={{ width: 40, height: 40 }}>
          <ViewInArIcon fontSize="small" />
        </Avatar>
      </ListItemAvatar>
      <ListItemText primary={model.name} primaryTypographyProps={{ noWrap: true }} />
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
        {valueLabel(valueOf(model))}
      </Typography>
    </ListItemButton>
  );
}

/** Top Viewed / Top Printed models -- 3-row preview with a See more dialog (fetchMore) showing
 *  an expanded list. Every row navigates to the model's detail page. */
export default function ModelListCard({ icon, title, models, valueOf, valueLabel, emptyText, seeMoreLabel, fetchMore }: Props) {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, color: "primary.main" }}>
        {icon}
        <Typography variant="h6" fontWeight={700} color="text.primary">{title}</Typography>
      </Box>

      {models.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{emptyText}</Typography>
      ) : (
        <List dense disablePadding>
          {models.map((model, idx) => (
            <ModelRow
              key={model.id}
              model={model}
              rank={idx + 1}
              valueOf={valueOf}
              valueLabel={valueLabel}
              onClick={() => navigate(`/models/${model.id}`)}
            />
          ))}
        </List>
      )}

      <Button onClick={() => setDialogOpen(true)} sx={{ alignSelf: "flex-start", mt: 1 }}>{seeMoreLabel}</Button>

      <SeeMoreDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={title}
        emptyText={emptyText}
        fetcher={fetchMore}
        getKey={(model) => model.id}
        renderItem={(model, idx) => (
          <ModelRow
            model={model}
            rank={idx + 1}
            valueOf={valueOf}
            valueLabel={valueLabel}
            onClick={() => { setDialogOpen(false); navigate(`/models/${model.id}`); }}
          />
        )}
      />
    </Paper>
  );
}

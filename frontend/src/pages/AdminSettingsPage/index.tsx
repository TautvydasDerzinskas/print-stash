import React from "react";
import { useTranslation } from "react-i18next";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import type { PreviewMode } from "../../api/settings";
import StorageSection from "./StorageSection";
import PreviewsSection from "./PreviewsSection";
import TriggersSection from "./TriggersSection";

type Props = {
  onUnauthorized?: () => void;
  onPreviewModeChanged?: (mode: PreviewMode) => void;
};

type Section = "root" | "storage" | "previews" | "triggers";

// Instance-wide config, gated to admins by the sidebar link that opens this page -- unlike
// SettingsPage, nothing here is a per-user preference.
export default function AdminSettingsPage({ onUnauthorized, onPreviewModeChanged }: Props) {
  const { t } = useTranslation("app");
  const [section, setSection] = React.useState<Section>("root");
  const backToRoot = () => setSection("root");

  if (section === "storage") {
    return <StorageSection onUnauthorized={onUnauthorized} onBack={backToRoot} />;
  }

  if (section === "previews") {
    return (
      <PreviewsSection
        onUnauthorized={onUnauthorized}
        onSaved={onPreviewModeChanged}
        onBack={backToRoot}
      />
    );
  }

  if (section === "triggers") {
    return <TriggersSection onUnauthorized={onUnauthorized} onBack={backToRoot} />;
  }

  const rootCards: Array<{ eyebrow: string; heading: string; desc: string; onClick: () => void }> = [
    {
      eyebrow: t("adminSettings.root.storageTitle"),
      heading: t("adminSettings.root.storageHeading"),
      desc: t("adminSettings.root.storageDesc"),
      onClick: () => setSection("storage"),
    },
    {
      eyebrow: t("adminSettings.root.previewsTitle"),
      heading: t("adminSettings.root.previewsHeading"),
      desc: t("adminSettings.root.previewsDesc"),
      onClick: () => setSection("previews"),
    },
    {
      eyebrow: t("adminSettings.root.triggersTitle"),
      heading: t("adminSettings.root.triggersHeading"),
      desc: t("adminSettings.root.triggersDesc"),
      onClick: () => setSection("triggers"),
    },
  ];

  return (
    <Grid container spacing={2}>
      {rootCards.map(card => (
        <Grid item xs={12} sm={6} key={card.heading}>
          <Card variant="outlined">
            <CardActionArea onClick={card.onClick}>
              <CardContent>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {card.eyebrow}
                </Typography>
                <Typography variant="h6">{card.heading}</Typography>
                <Typography variant="body2" color="text.secondary">{card.desc}</Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

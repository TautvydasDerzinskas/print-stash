import React from "react";
import { useTranslation } from "react-i18next";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import type { AppSettings } from "../../utils/settings";
import { SLICER_BRIDGE_ENABLED } from "../../constants/featureFlags";
import SlicerSection from "./SlicerSection";
import EngravingSection from "./EngravingSection";
import ImportsSection from "./ImportsSection";
import LanguageSection from "./LanguageSection";

type Props = {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onAssetsChanged?: () => void;
  onFoldersChanged?: () => void;
  onUnauthorized?: () => void;
  onSelectFolder?: (id: string | null) => void;
};

type Section = "root" | "slicer" | "engraving" | "imports" | "language";

export default function SettingsPage({
  settings,
  onChange,
  onAssetsChanged,
  onFoldersChanged,
  onUnauthorized,
  onSelectFolder,
}: Props) {
  const { t } = useTranslation("app");
  const [section, setSection] = React.useState<Section>("root");
  const backToRoot = () => setSection("root");

  if (section === "slicer") {
    return (
      <SlicerSection
        slicer={settings.slicer}
        onUpdate={patch => onChange({ ...settings, slicer: { ...settings.slicer, ...patch } })}
        onBack={backToRoot}
      />
    );
  }

  if (section === "engraving") {
    return (
      <EngravingSection
        engraving={settings.engraving}
        onUpdate={patch => onChange({ ...settings, engraving: { ...settings.engraving, ...patch } })}
        onBack={backToRoot}
      />
    );
  }

  if (section === "language") {
    return <LanguageSection onBack={backToRoot} />;
  }

  if (section === "imports") {
    return (
      <ImportsSection
        makerworldCookie={settings.makerworld.cookie}
        thingiverseCookie={settings.thingiverse.cookie}
        onUpdateMakerWorld={patch => onChange({ ...settings, makerworld: { ...settings.makerworld, ...patch } })}
        onUpdateThingiverse={patch => onChange({ ...settings, thingiverse: { ...settings.thingiverse, ...patch } })}
        onAssetsChanged={onAssetsChanged}
        onFoldersChanged={onFoldersChanged}
        onUnauthorized={onUnauthorized}
        onSelectFolder={onSelectFolder}
        onBack={backToRoot}
      />
    );
  }

  const rootCards: Array<{ eyebrow: string; heading: string; desc: string; onClick: () => void }> = [
    ...(SLICER_BRIDGE_ENABLED
      ? [{
          eyebrow: t("settings.root.slicerTitle"),
          heading: t("settings.root.slicerHeading"),
          desc: t("settings.root.slicerDesc"),
          onClick: () => setSection("slicer"),
        }]
      : []),
    {
      eyebrow: t("settings.root.engravingTitle"),
      heading: t("settings.root.engravingHeading"),
      desc: t("settings.root.engravingDesc"),
      onClick: () => setSection("engraving"),
    },
    {
      eyebrow: t("settings.root.importsTitle"),
      heading: t("settings.root.importsHeading"),
      desc: t("settings.root.importsDesc"),
      onClick: () => setSection("imports"),
    },
    {
      eyebrow: t("settings.root.languageTitle"),
      heading: t("settings.root.languageHeading"),
      desc: t("settings.root.languageDesc"),
      onClick: () => setSection("language"),
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

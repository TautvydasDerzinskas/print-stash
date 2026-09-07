import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import type { MakerWorldSettings, ThingiverseSettings } from "../../../utils/settings";
import SectionHeader from "../SectionHeader";
import MountImportPanel from "./MountImportPanel";
import FolderScanPanel from "./FolderScanPanel";
import CookiePanel from "./CookiePanel";

type Props = {
  makerworldCookie: string;
  thingiverseCookie: string;
  onUpdateMakerWorld: (patch: Partial<MakerWorldSettings>) => void;
  onUpdateThingiverse: (patch: Partial<ThingiverseSettings>) => void;
  onAssetsChanged?: () => void;
  onFoldersChanged?: () => void;
  onUnauthorized?: () => void;
  onSelectFolder?: (id: string | null) => void;
  onBack: () => void;
};

/** Composes the three independent Imports sub-panels: server-side mount import, the local
 *  folder-scan feature, and the MakerWorld/Thingiverse session-cookie editors. */
export default function ImportsSection({
  makerworldCookie,
  thingiverseCookie,
  onUpdateMakerWorld,
  onUpdateThingiverse,
  onAssetsChanged,
  onFoldersChanged,
  onUnauthorized,
  onSelectFolder,
  onBack,
}: Props) {
  const { t } = useTranslation("app");
  return (
    <Stack spacing={3}>
      <SectionHeader
        title={t("settings.imports.heading")}
        subtitle={t("settings.imports.subtitle")}
        onBack={onBack}
        backLabel={t("settings.back")}
      />

      <MountImportPanel onUnauthorized={onUnauthorized} />

      <FolderScanPanel
        onAssetsChanged={onAssetsChanged}
        onFoldersChanged={onFoldersChanged}
        onUnauthorized={onUnauthorized}
        onSelectFolder={onSelectFolder}
      />

      <CookiePanel
        cookie={makerworldCookie}
        onSave={cookie => onUpdateMakerWorld({ cookie })}
        headingText={t("settings.imports.makerworldHeading")}
        descText={t("settings.imports.makerworldDesc")}
        helpText={t("settings.imports.makerworldHelp")}
        placeholderText={t("settings.imports.makerworldPlaceholder") ?? undefined}
      />

      <CookiePanel
        cookie={thingiverseCookie}
        onSave={cookie => onUpdateThingiverse({ cookie })}
        headingText={t("settings.imports.thingiverseHeading")}
        descText={t("settings.imports.thingiverseDesc")}
        helpText={t("settings.imports.thingiverseHelp")}
        placeholderText={t("settings.imports.thingiversePlaceholder") ?? undefined}
      />
    </Stack>
  );
}

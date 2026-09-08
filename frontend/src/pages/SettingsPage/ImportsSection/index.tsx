import React from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import type { MakerWorldSettings } from "../../../utils/settings";
import SectionHeader from "../../../components/SectionHeader";
import FolderScanPanel from "./FolderScanPanel";
import CookiePanel from "./CookiePanel";

type Props = {
  makerworldCookie: string;
  onUpdateMakerWorld: (patch: Partial<MakerWorldSettings>) => void;
  onAssetsChanged?: () => void;
  onFoldersChanged?: () => void;
  onUnauthorized?: () => void;
  onSelectFolder?: (id: string | null) => void;
  onBack: () => void;
};

/** Composes the Imports sub-panels: server-side mount import, the local folder-scan feature,
 *  and the MakerWorld session-cookie editor. Thingiverse import auth is an admin-configured,
 *  instance-wide Access Token (see AdminSettingsPage/ThingiverseSection) -- not a per-user
 *  setting, so it has no panel here. */
export default function ImportsSection({
  makerworldCookie,
  onUpdateMakerWorld,
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
    </Stack>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UnauthorizedError } from "../../api/client";
import { type Plate, type Print, printsApi } from "../../api/prints";
import { saveResponseToDisk } from "../../utils/downloadResponse";

/** Shared download logic for a Print: a single-plate model downloads its one file directly; a
 *  multi-plate one opens a picker (download-all-as-zip, or pick one plate) -- see
 *  DownloadPickerDialog. Used by both ModelActionsMenu's "Download" menu item and the model
 *  detail page's own big "Download model files" button, so the two behaviors can't drift apart. */
export function useDownloadPrint(print: Print, onUnauthorized?: () => void) {
  const { t } = useTranslation(["models"]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadError = (err: unknown) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return;
    }
    console.error(err);
    alert(t("models:detail.downloadFailed"));
  };

  const downloadPlate = async (plate: Plate) => {
    setDownloading(true);
    try {
      const res = await fetch(printsApi.fileUrl(plate.url));
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error("Download failed");
      await saveResponseToDisk(res, plate.filename || "download");
      setPickerOpen(false);
      printsApi.recordDownload(print.id).catch(() => {});
    } catch (err) {
      handleDownloadError(err);
    } finally {
      setDownloading(false);
    }
  };

  const downloadAllZip = async () => {
    setDownloading(true);
    try {
      const res = await printsApi.downloadZip({ print_ids: [print.id] });
      await saveResponseToDisk(res, `${print.name || "model"}.zip`);
      setPickerOpen(false);
      printsApi.recordDownload(print.id).catch(() => {});
    } catch (err) {
      handleDownloadError(err);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = () => {
    if (print.plates.length <= 1) {
      const plate = print.plates[0];
      if (plate) void downloadPlate(plate);
      return;
    }
    setPickerOpen(true);
  };

  const sortedPlates = print.plates.toSorted((a, b) => a.position - b.position);

  return { pickerOpen, setPickerOpen, downloading, handleDownload, downloadPlate, downloadAllZip, sortedPlates };
}

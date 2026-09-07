import { useRef } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import { useTranslation } from "react-i18next";
import { type Plate, printsApi } from "../../../api/prints";

// The plate-switcher thumbnail strip in PrintPreviewModal: a row of clickable plate thumbnails
// (defaulting to whichever plate is passed as active -- callers are responsible for defaulting to
// plate 0), each with an overlaid remove button, plus a trailing "add plate" tile. Owns its own
// hidden file input so the parent modal only deals with File[] via onAddPlateFiles.
export default function PlateSwitcher({
  plates,
  activePlateId,
  onSelectPlate,
  onRemovePlate,
  removingPlateId,
  canRemove,
  addingPlate,
  onAddPlateFiles,
}: {
  plates: Plate[];
  activePlateId: string | null;
  onSelectPlate: (id: string) => void;
  onRemovePlate: (plate: Plate) => void;
  removingPlateId: string | null;
  canRemove: boolean;
  addingPlate: boolean;
  onAddPlateFiles: (files: File[]) => void;
}) {
  const { t } = useTranslation(["library"]);
  const addPlateInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length) onAddPlateFiles(files);
  };

  return (
    <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
      {plates.map(plate => {
        const isActive = plate.id === activePlateId || (!activePlateId && plate.id === plates[0]?.id);
        return (
          <Box key={plate.id} sx={{ position: "relative", flexShrink: 0 }}>
            <ButtonBase
              onClick={() => onSelectPlate(plate.id)}
              title={plate.filename}
              sx={{
                height: 64,
                width: 64,
                overflow: "hidden",
                borderRadius: 1,
                border: "2px solid",
                borderColor: isActive ? "primary.main" : "divider",
              }}
            >
              {plate.thumb_url ? (
                <Box
                  component="img"
                  src={printsApi.fileUrl(plate.thumb_url)}
                  alt={plate.filename}
                  sx={{ height: "100%", width: "100%", objectFit: "cover" }}
                />
              ) : (
                <Box sx={{ display: "flex", height: "100%", width: "100%", alignItems: "center", justifyContent: "center", bgcolor: "action.hover" }}>
                  <Typography variant="caption" color="text.secondary">{plate.position + 1}</Typography>
                </Box>
              )}
            </ButtonBase>
            {canRemove && (
              <IconButton
                size="small"
                onClick={() => onRemovePlate(plate)}
                disabled={removingPlateId === plate.id}
                title={t("library:previewModal.removePlateTooltip")}
                sx={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  width: 20,
                  height: 20,
                  bgcolor: "rgba(0, 0, 0, 0.7)",
                  color: "common.white",
                  "&:hover": { bgcolor: "rgba(0, 0, 0, 0.85)" },
                }}
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
          </Box>
        );
      })}
      <ButtonBase
        onClick={() => addPlateInputRef.current?.click()}
        disabled={addingPlate}
        title={t("library:previewModal.addPlateTooltip")}
        sx={{
          height: 64,
          width: 64,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.25,
          borderRadius: 1,
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <AddPhotoAlternateIcon fontSize="small" />
        <Typography variant="caption" sx={{ fontSize: 9 }}>
          {addingPlate ? t("library:previewModal.addingPlate") : t("library:previewModal.addPlate")}
        </Typography>
      </ButtonBase>
      <input
        ref={addPlateInputRef}
        type="file"
        multiple
        hidden
        accept=".stl,.3mf,.step,.stp,.obj"
        onChange={handleFileChange}
      />
    </Stack>
  );
}

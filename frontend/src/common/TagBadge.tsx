import React from "react";
import Chip from "@mui/material/Chip";
import { useTranslation } from "react-i18next";
import { colorForTag } from "../utils/tagColors";

type TagBadgeProps = {
  tag: string;
  onRemove?: () => void;
};

export default function TagBadge({ tag, onRemove }: TagBadgeProps) {
  const { t } = useTranslation("app");
  const colors = colorForTag(tag);
  return (
    <Chip
      label={tag}
      size="small"
      onDelete={onRemove}
      deleteIcon={
        onRemove ? <span aria-label={t("tagInput.removeTag", { tag })}>×</span> : undefined
      }
      sx={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: "1px solid",
        borderColor: colors.border,
        fontWeight: 500,
        "& .MuiChip-deleteIcon": {
          color: "inherit",
          opacity: 0.7,
          "&:hover": { opacity: 1, color: "inherit" },
        },
      }}
    />
  );
}

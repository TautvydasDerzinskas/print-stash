import React from "react";
import Box from "@mui/material/Box";

type Props = {
  size?: "lg" | "md" | "sm";
};

/** A stylized print head/nozzle above three widening layer lines -- a minimal glyph for "an
 *  object being 3D printed" that still reads clearly at sidebar size. */
function PrinterMark() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      sx={{ width: "1em", height: "1em", color: "primary.main" }}
    >
      <path d="M12 2.5 8.5 9h7L12 2.5Z" />
      <rect x="9" y="11" width="6" height="2.2" rx="0.6" />
      <rect x="6.5" y="14.2" width="11" height="2.2" rx="0.6" />
      <rect x="4" y="17.4" width="16" height="2.4" rx="0.6" />
    </Box>
  );
}

const FONT_SIZES: Record<NonNullable<Props["size"]>, string> = {
  lg: "2.25rem",
  md: "1.5rem",
  sm: "1.125rem",
};

export default function Wordmark({ size = "md" }: Props) {
  const fontSize = FONT_SIZES[size];
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Box sx={{ fontSize, lineHeight: 0 }}>
        <PrinterMark />
      </Box>
      <Box
        component="span"
        sx={{
          fontSize,
          fontFamily: '"PrintStash Display", sans-serif',
          letterSpacing: "0.01em",
          color: "text.primary",
        }}
      >
        PrintStash
      </Box>
    </Box>
  );
}

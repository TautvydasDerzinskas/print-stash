import Box from "@mui/material/Box";
import type { ResolvedTheme } from "../constants/settingsOptions";
import markColor from "../assets/logos/thingport-mark-color.svg";
import markOnDark from "../assets/logos/thingport-mark-on-dark.svg";

type Props = {
  theme: ResolvedTheme;
  size?: "lg" | "md" | "sm";
};

const HEIGHTS: Record<NonNullable<Props["size"]>, string> = {
  lg: "2.25rem",
  md: "1.5rem",
  sm: "1.125rem",
};

/** The Thingport icon-only mark (no wordmark) -- used where the viewer's own theme prop, not the
 *  surrounding MUI theme, decides which variant to show (e.g. ModelViewer's fixed-theme preview
 *  canvas). */
export default function BrandMark({ theme, size = "md" }: Props) {
  const src = theme === "dark" ? markOnDark : markColor;
  return (
    <Box
      component="img"
      src={src}
      alt="Thingport"
      sx={{ height: HEIGHTS[size], width: "auto", display: "block" }}
    />
  );
}

import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import lockupColor from "../assets/logos/thingport-lockup-compact-color.svg";
import lockupOnDark from "../assets/logos/thingport-lockup-compact-on-dark.svg";

type Props = {
  size?: "lg" | "md" | "sm";
};

const HEIGHTS: Record<NonNullable<Props["size"]>, string> = {
  lg: "2.25rem",
  md: "1.5rem",
  sm: "1.125rem",
};

/** The Thingport logo lockup (icon + wordmark combined into one image) -- swaps between the
 *  light- and dark-theme variants based on the active MUI palette mode. */
export default function Wordmark({ size = "md" }: Props) {
  const theme = useTheme();
  const src = theme.palette.mode === "dark" ? lockupOnDark : lockupColor;
  return (
    <Box
      component="img"
      src={src}
      alt="Thingport"
      sx={{ height: HEIGHTS[size], width: "auto", display: "block" }}
    />
  );
}

import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { type ResolvedTheme } from "../constants/settingsOptions";

// PrintStash has no logo asset (yet) -- this text wordmark is an intentional
// placeholder so both the login screen and the library header render
// something branded instead of a 404'd <img>. Swap for a real logo image
// whenever one exists; keep referencing plausible filenames
// (e.g. /img/printstash-logo-light.svg) if that work resumes.
type Props = {
  theme: ResolvedTheme;
  size?: "lg" | "md";
};

export default function Wordmark({ size = "md" }: Props) {
  const fontSize = size === "lg" ? "2.25rem" : "1.5rem";
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        aria-hidden="true"
        sx={{
          width: "0.8em",
          height: "0.8em",
          fontSize,
          borderRadius: "0.2em",
          bgcolor: "primary.main",
        }}
      />
      <Typography
        component="span"
        sx={{ fontSize, fontWeight: 600, letterSpacing: "-0.02em", color: "text.primary" }}
      >
        Print
        <Box component="span" sx={{ color: "primary.main" }}>
          Stash
        </Box>
      </Typography>
    </Box>
  );
}

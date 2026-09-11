import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import Tooltip from "@mui/material/Tooltip";
import Zoom from "@mui/material/Zoom";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { useImportJob } from "./ImportJobContext";

// Appears once enough of the page has scrolled past that "a bit down" reads as true, not on the
// first pixel of scroll -- matches the threshold feel of most scroll-to-top buttons.
const SCROLL_SHOW_THRESHOLD = 200;

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Fixed bottom-right "back to top" FAB, shown app-wide (mounted once in AppLayout) -- the app
 *  scrolls at the window level (see AppLayout's own comment on why `main` has no overflow of its
 *  own), so a single `window.scroll` listener here covers every route. Zoom in/out on the
 *  visibility flip for the "pop" MUI's own back-to-top example uses, rather than an instant
 *  show/hide. Shifts up while ImportProgressBar is showing (also fixed to the bottom, full-width)
 *  so the two don't overlap. */
export default function BackToTopButton() {
  const { t } = useTranslation("app");
  const [visible, setVisible] = useState(false);
  const { activeJob } = useImportJob();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SCROLL_SHOW_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const label = t("shell.backToTop");

  return (
    <Zoom in={visible}>
      <Box
        onClick={scrollToTop}
        sx={{
          position: "fixed",
          right: 24,
          bottom: activeJob ? 88 : 24,
          zIndex: (theme) => theme.zIndex.fab,
          transition: (theme) => theme.transitions.create("bottom"),
        }}
      >
        <Tooltip title={label}>
          <Fab color="primary" aria-label={label ?? undefined} size="medium">
            <KeyboardArrowUpIcon />
          </Fab>
        </Tooltip>
      </Box>
    </Zoom>
  );
}

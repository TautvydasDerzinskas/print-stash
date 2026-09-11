import { useEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import StarIcon from "@mui/icons-material/Star";
import type { SxProps, Theme } from "@mui/material/styles";

// Ported from https://codepen.io/matthewbolanos/pen/yYXQZp (the star favourite-toggle burst
// animation), swapping Font Awesome + jQuery for an MUI icon + a React-driven replay. Every
// pixel value below is copied verbatim from that pen: the ring and icon-pop are in `em`
// (cascades from fontSize, so they scale correctly at our much smaller icon size for free), and
// the sparkle circle keeps the pen's raw viewBox units (r=24, dasharray "1 29", stroke-width
// 0->20->0) inside its own viewBox -- SVG scales those with the box's own rendered size, so
// shrinking the box to fit a 20px icon preserves the pen's exact proportions without retuning.
const popping = keyframes`
  0%   { transform: scale(0, 0); }
  40%  { transform: scale(0, 0); }
  75%  { transform: scale(1.3, 1.3); }
  100% { transform: scale(1, 1); }
`;
const ringBorderWidth = keyframes`
  0%   { border-width: 0; }
  50%  { border-width: .25em; }
  100% { border-width: 0; }
`;
const ringSize = keyframes`
  0%   { width: 0; height: 0; }
  100% { width: 1.5em; height: 1.5em; }
`;
// The pen's own svg wasn't centered via transform (it used top/left + negative margins instead),
// so its "transform: scale(...)" keyframes never had to share the property with anything else.
// Ours centers the box with "translate(-50%, -50%)" (percentage margins need a known box size,
// which an em-sized box doesn't have), so that translate has to be re-asserted on every frame
// here -- otherwise the animation's own transform would replace it outright and the sparkle ring
// would jump to the top-left corner the instant it starts playing.
const sparkleSize = keyframes`
  0%  { transform: translate(-50%, -50%) scale(.2, .2); }
  5%  { transform: translate(-50%, -50%) scale(.2, .2); }
  85% { transform: translate(-50%, -50%) scale(2, 2); }
`;
const sparkleWidth = keyframes`
  0%   { stroke-width: 0; }
  15%  { stroke-width: 20; }
  100% { stroke-width: 0; }
`;

type Props = {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  /** The pen's own accent was an arbitrary demo purple (#ca12ea) -- gold reads as "starred"
   *  without needing to look up what an app-specific brand purple would even mean here. */
  activeColor?: string;
  /** Needs to be readable against whatever backdrop this instance sits on -- e.g. white over
   *  ModelCard's dark hover scrim, vs. a neutral grey over FavoriteButton's plain page bg. */
  inactiveColor?: string;
  /** Glyph size in px. Also the `em` baseline the ring/sparkle keyframes (copied from the pen in
   *  em/viewBox units) scale from, so this must be a real pixel font-size -- not MUI's SvgIcon
   *  `fontSize="inherit"`, which would leave that baseline undefined. */
  size?: number;
  sx?: SxProps<Theme>;
};

/** A favourite/star toggle with the codepen.io/matthewbolanos/pen/yYXQZp burst animation: the
 *  star pops, a ring flashes outward, and a dashed circle's dashes balloon into sparkles and fade
 *  -- all in one shot, only when going from unfavourited to favourited. Un-favouriting just fades
 *  the color back down with no animation, matching the original pen (a burst reads as a
 *  celebration; removing a favourite isn't one). Doesn't replay on mount even if `active` starts
 *  true, only on an actual false -> true click. */
export default function StarToggle({
  active,
  onClick,
  disabled,
  ariaLabel,
  activeColor = "#e0a52c",
  inactiveColor = "text.disabled",
  size = 20,
  sx,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) {
      // Force a reflow before flipping playing back on, so a rapid unfavourite -> refavourite
      // still restarts the animation instead of no-op'ing (it's already "on").
      setPlaying(false);
      const raf = requestAnimationFrame(() => setPlaying(true));
      wasActive.current = active;
      return () => cancelAnimationFrame(raf);
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (!playing) return;
    // A fixed timeout, not onAnimationEnd: the four animations here finish at three different
    // times (.35s ring, .5s pop, .65s sparkle) and onAnimationEnd bubbles from whichever finishes
    // first, which would flip `playing` off -- and with it, every other still-running one's
    // `sx`-conditional `animation` property -- while the pop and sparkle still have time left.
    const PLAYING_DURATION_MS = 650;
    const timer = setTimeout(() => setPlaying(false), PLAYING_DURATION_MS);
    return () => clearTimeout(timer);
  }, [playing]);

  return (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      sx={{
        position: "relative",
        fontSize: `${size}px`,
        color: active ? activeColor : inactiveColor,
        transition: active ? "color 0s" : "color .25s ease",
        "&::before": {
          content: '""',
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 0,
          height: 0,
          borderRadius: "10em",
          border: "0px solid",
          borderColor: activeColor,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          ...(playing && { animation: `${ringBorderWidth} .35s 1, ${ringSize} .35s 1` }),
        },
        ...sx,
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 100 100"
        aria-hidden
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "1.25em",
          height: "1.25em",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          ...(playing && { animation: `${sparkleSize} .65s 1` }),
        }}
      >
        <Box
          component="circle"
          cx={50}
          cy={50}
          r={24}
          fill="transparent"
          stroke={activeColor}
          strokeWidth={0}
          strokeDasharray="1 29"
          sx={playing ? { animation: `${sparkleWidth} .65s 1` } : undefined}
        />
      </Box>
      <StarIcon
        fontSize="inherit"
        sx={{ position: "relative", ...(playing && { animation: `${popping} .5s 1` }) }}
      />
    </IconButton>
  );
}

/**
 * The "Open in Slicer" feature depends on the standalone slicer-bridge helper (a desktop app
 * registering the printstash-slicer:// protocol), which has been removed from this project for
 * now. Flip this back to true once a bridge (or another launch mechanism) exists again — every
 * "open in slicer" UI touchpoint is gated behind this single flag.
 */
export const SLICER_BRIDGE_ENABLED = false;

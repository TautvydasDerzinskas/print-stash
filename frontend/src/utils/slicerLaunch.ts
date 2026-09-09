// The PrintStash Bridge helper app's own protocol (see bridge/README.md) -- it downloads the
// file itself and hands it to the local slicer, for slicers whose own URL handler won't take it
// directly.
const BRIDGE_SCHEME = "print-stash";

// Bambu Studio's bambustudio:// handler only opens files served from an allowlist of domains it
// trusts (Bambu Lab's own storefronts) -- a self-hosted PrintStash instance is never on it, so
// the direct protocol silently no-ops. Routed through the Bridge instead. OrcaSlicer and
// PrusaSlicer accept any HTTP(S) URL through their own handler, so they bypass the Bridge.
const BRIDGED_SLICERS = new Set(["bambustudio"]);

// Builds the URL that "Open in {Slicer}" navigates to: either the slicer's own registered
// protocol handler (e.g. orcaslicer://), or -- for a BRIDGED_SLICERS id -- the PrintStash Bridge
// protocol, which downloads fileUrl locally before handing it to the slicer. Only meaningful for
// the SLICER_OPTIONS ids that register a protocol; never call this for "other".
export function slicerLaunchUrl(slicerId: string, fileUrl: string, filename?: string): string {
  if (BRIDGED_SLICERS.has(slicerId)) {
    const params = new URLSearchParams({ url: fileUrl, slicer: slicerId });
    if (filename) params.set("filename", filename);
    return `${BRIDGE_SCHEME}://open?${params.toString()}`;
  }
  return `${slicerId}://open?file=${encodeURIComponent(fileUrl)}`;
}

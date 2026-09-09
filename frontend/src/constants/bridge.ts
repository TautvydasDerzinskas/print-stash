// PrintStash Bridge is a small helper app (source in /bridge, built by
// .github/workflows/bridge-release.yml) that "Open in Bambu Studio" hands off to instead of
// Bambu Studio's own bambustudio:// link -- see bridge/README.md for why. These are stable URLs:
// GitHub always resolves /releases/latest/download/<asset> to that asset on the most recent
// release, so they don't need updating when a new Bridge build ships.
const BRIDGE_RELEASES_BASE = "https://github.com/TautvydasDerzinskas/print-stash/releases/latest/download";

export type BridgeDownload = { os: "windows" | "macos" | "linux"; label: string; asset: string };

export const BRIDGE_DOWNLOADS: BridgeDownload[] = [
  { os: "windows", label: "Windows", asset: "print-stash-bridge-windows-amd64.exe" },
  { os: "macos", label: "macOS", asset: "print-stash-bridge-macos" },
  { os: "linux", label: "Linux", asset: "print-stash-bridge-linux-amd64" },
];

export function bridgeDownloadUrl(asset: string): string {
  return `${BRIDGE_RELEASES_BASE}/${asset}`;
}

// Display info for a Print's import source (Print.source_provider from the backend -- see
// importService.ts's identifySourceModel). Same brand colors UserMenu already uses for its
// MakerWorld connection chip, kept here so the model card badge and "Open in {Provider}" menu
// item can share one source of truth instead of drifting.
export type ImportProviderInfo = { label: string; color: string };

export const IMPORT_PROVIDER_INFO: Record<string, ImportProviderInfo> = {
  makerworld: { label: "MakerWorld", color: "#00B800" },
  thingiverse: { label: "Thingiverse", color: "#2B78FE" },
  printables: { label: "Printables", color: "#FA6831" },
};

export function importProviderInfo(provider: string | null | undefined): ImportProviderInfo | null {
  if (!provider) return null;
  return IMPORT_PROVIDER_INFO[provider] ?? null;
}

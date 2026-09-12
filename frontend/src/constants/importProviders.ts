// Display info for a Print's import source (Print.source_provider from the backend -- see
// importService.ts's identifySourceModel). Same brand colors UserMenu already uses for its
// MakerWorld connection chip, kept here so the model card badge and "Open in {Provider}" menu
// item can share one source of truth instead of drifting.
//
// `color`/`textColor` are plain sx palette-token strings (e.g. "text.primary",
// "background.paper") for "thingport", or fixed hex brand colors for everything else -- both
// forms resolve the same way through MUI's sx `bgcolor`/`color`, so call sites don't need to
// care which kind a given provider uses.
export type ImportProviderInfo = { label: string; color: string; textColor?: string };

export const IMPORT_PROVIDER_INFO: Record<string, ImportProviderInfo> = {
  makerworld: { label: "MakerWorld", color: "#00B800" },
  thingiverse: { label: "Thingiverse", color: "#2B78FE" },
  printables: { label: "Printables", color: "#FA6831" },
  // Not an external site -- a direct upload/zip import (Print.source_provider is null; this key
  // only ever comes from printProviderInfo's fallback below, ID never stored this literally).
  // Deliberately monochrome (the app's own heading-text/panel colors, inverted) rather than a
  // brand hue, so it reads as "this is us" instead of competing with the real provider badges.
  thingport: { label: "Thingport", color: "text.primary", textColor: "background.paper" },
};

/** Looks up a KNOWN external provider only -- null for anything else, including a plain upload
 * (Print.source_provider is null there). Used where "no real external source" must stay a
 * distinct, falsy case, e.g. ModelActionsMenu's "Open in {Provider}" link, which a Thingport
 * upload has nothing to point to. */
export function importProviderInfo(provider: string | null | undefined): ImportProviderInfo | null {
  if (!provider) return null;
  return IMPORT_PROVIDER_INFO[provider] ?? null;
}

/** Same lookup, but for contexts that want a badge for EVERY print, including ones with no
 * external source -- ModelCard's thumbnail badge and the dashboard's Top Providers list both
 * want "Thingport" rather than nothing when source_provider is null. */
export function printProviderInfo(provider: string | null | undefined): ImportProviderInfo {
  return importProviderInfo(provider) ?? IMPORT_PROVIDER_INFO.thingport;
}

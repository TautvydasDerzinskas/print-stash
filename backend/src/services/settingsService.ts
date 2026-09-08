import { prisma } from "../db";

// Storage-template settings (get/setStorageTemplate) live in printService.ts — not duplicated here.

async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row === null || row === undefined) return fallback;
  return typeof row.value === "boolean" ? row.value : fallback;
}

async function setBoolSetting(key: string, value: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

const ALLOW_REGISTRATIONS_KEY = "allow_registrations";

export async function getAllowRegistrations(fallback: boolean): Promise<boolean> {
  return getBoolSetting(ALLOW_REGISTRATIONS_KEY, fallback);
}

export async function setAllowRegistrations(value: boolean): Promise<void> {
  await setBoolSetting(ALLOW_REGISTRATIONS_KEY, value);
}

export type PreviewMode = "automatic" | "on-demand" | "disabled";
const PREVIEW_MODES = new Set<PreviewMode>(["automatic", "on-demand", "disabled"]);
const PREVIEW_MODE_KEY = "preview_mode";
const DEFAULT_PREVIEW_MODE: PreviewMode = "automatic";

// Instance-wide (not per-user): every browser hitting this API generates/serves previews
// against the same storage, so letting each user pick their own mode would just mean the last
// save wins anyway. Admin-configured instead, like the storage template above.
export async function getPreviewMode(): Promise<PreviewMode> {
  const row = await prisma.setting.findUnique({ where: { key: PREVIEW_MODE_KEY } });
  const value = row?.value;
  return typeof value === "string" && PREVIEW_MODES.has(value as PreviewMode)
    ? (value as PreviewMode)
    : DEFAULT_PREVIEW_MODE;
}

export async function setPreviewMode(value: PreviewMode): Promise<void> {
  await prisma.setting.upsert({
    where: { key: PREVIEW_MODE_KEY },
    create: { key: PREVIEW_MODE_KEY, value },
    update: { value },
  });
}

const THINGIVERSE_ACCESS_TOKEN_KEY = "thingiverse_access_token";

// Instance-wide, not per-user: it's a credential for api.thingiverse.com (the official
// Developer API -- see thingiverseApi.ts), tied to whichever Thingiverse account registered
// the app at thingiverse.com/apps/create, not to any one PrintStash user's own account. Every
// user's Thingiverse imports share it, same as the storage template and preview mode above.
export async function getThingiverseAccessToken(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: THINGIVERSE_ACCESS_TOKEN_KEY } });
  const value = row?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function setThingiverseAccessToken(value: string | null): Promise<void> {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    await prisma.setting.deleteMany({ where: { key: THINGIVERSE_ACCESS_TOKEN_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: THINGIVERSE_ACCESS_TOKEN_KEY },
    create: { key: THINGIVERSE_ACCESS_TOKEN_KEY, value: trimmed },
    update: { value: trimmed },
  });
}

import type { Prisma } from "@prisma/client";
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

export type SmtpSettings = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
};

const SMTP_SETTINGS_KEY = "smtp_settings";
const DEFAULT_SMTP_FROM = "PrintStash <no-reply@localhost>";

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Seeds from SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/SMTP_FROM the first time this is
// read on a fresh instance -- once an admin saves anything via PATCH /settings/smtp, the DB row
// becomes the sole source of truth (see setSmtpSettings) and these env vars are no longer
// consulted, same pattern as the storage template / preview mode / Thingiverse token above.
function smtpSeedFromEnv(): SmtpSettings {
  return {
    host: (process.env.SMTP_HOST || "").trim() || null,
    port: envInt("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: (process.env.SMTP_USER || "").trim() || null,
    pass: (process.env.SMTP_PASS || "").trim() || null,
    from: (process.env.SMTP_FROM || "").trim() || DEFAULT_SMTP_FROM,
  };
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const row = await prisma.setting.findUnique({ where: { key: SMTP_SETTINGS_KEY } });
  if (row && typeof row.value === "object" && row.value !== null && !Array.isArray(row.value)) {
    return { ...smtpSeedFromEnv(), ...(row.value as Partial<SmtpSettings>) };
  }
  return smtpSeedFromEnv();
}

export async function isSmtpConfigured(): Promise<boolean> {
  return Boolean((await getSmtpSettings()).host);
}

export async function setSmtpSettings(patch: Partial<SmtpSettings>): Promise<SmtpSettings> {
  const next = { ...(await getSmtpSettings()), ...patch };
  await prisma.setting.upsert({
    where: { key: SMTP_SETTINGS_KEY },
    create: { key: SMTP_SETTINGS_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}

export type DatabaseInfo = {
  provider: string;
  host: string | null;
  port: number | null;
  database: string | null;
  user: string | null;
};

// Read-only: reflects whatever DATABASE_URL the process was actually started with. Unlike the
// settings above, there's no DB-backed override -- switching databases means restarting the
// process against a different env var, not something an admin UI action could safely do (the
// row it would need to read that override from lives in the database being switched away from).
export function getDatabaseInfo(): DatabaseInfo {
  const raw = process.env.DATABASE_URL || "";
  try {
    const url = new URL(raw);
    return {
      provider: url.protocol.replace(/:$/, "") || "postgresql",
      host: url.hostname || null,
      port: url.port ? Number(url.port) : null,
      database: url.pathname.replace(/^\//, "") || null,
      user: url.username ? decodeURIComponent(url.username) : null,
    };
  } catch {
    return { provider: "postgresql", host: null, port: null, database: null, user: null };
  }
}

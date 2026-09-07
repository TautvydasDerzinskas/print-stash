import path from "node:path";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const STORAGE = path.resolve(process.env.FILE_STORAGE || "./storage");
export const THUMBS = path.join(STORAGE, "thumbs");
export const BUNDLES = path.join(STORAGE, "bundles");

export const AUTH_SECRET = process.env.AUTH_SECRET || "changeme-secret";
export const AUTH_TOKEN_TTL = envInt("AUTH_TOKEN_TTL", 43200);
export const AUTH_ALGO = "HS256" as const;
// A user registering with this exact (lowercased) email becomes ADMIN automatically, and may
// register even while registrations are otherwise disabled, as long as no admin exists yet --
// the bootstrap escape hatch so an operator can never lock themselves out of the first account.
export const INITIAL_ADMIN_EMAIL = (process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();

export const IMPORT_ALLOWED_EXTS = new Set([".stl", ".3mf", ".step", ".stp", ".obj", ".lbrn", ".lbrn2", ".zip"]);
export const IMPORT_EXT_PRIORITY = [".3mf", ".stl", ".step", ".stp", ".lbrn2", ".lbrn", ".zip"];
export const IMPORT_BLOCKED_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".jfif", ".tif", ".tiff",
  ".css", ".js", ".mjs", ".map", ".json", ".ico", ".woff", ".woff2", ".ttf", ".eot",
]);
export const IMPORT_TIMEOUT_SECONDS = envInt("IMPORT_TIMEOUT_SECONDS", 30);
export const IMPORT_MAX_MB = envInt("IMPORT_MAX_MB", 512);
export const IMPORT_MAX_BYTES = Math.max(1, IMPORT_MAX_MB) * 1024 * 1024;
export const IMPORT_HTML_MAX_KB = envInt("IMPORT_HTML_MAX_KB", 4096);
export const IMPORT_HTML_MAX_BYTES = Math.max(64, IMPORT_HTML_MAX_KB) * 1024;
export const IMPORT_USER_AGENT = "PrintStash/1.0";
export const IMPORT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export const FLARESOLVERR_URL = (process.env.FLARESOLVERR_URL || "").trim();
export const FLARESOLVERR_TIMEOUT_MS = envInt("FLARESOLVERR_TIMEOUT_MS", 60000);
export const FLARESOLVERR_SESSION_TTL_MS = envInt("FLARESOLVERR_SESSION_TTL_MS", 15 * 60 * 1000);

export const API_PORT = envInt("API_PORT", 8000);

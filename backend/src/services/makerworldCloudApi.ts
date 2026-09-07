import { IMPORT_BROWSER_USER_AGENT, IMPORT_TIMEOUT_SECONDS } from "../config";
import { decodeHtmlEntities, htmlToPlainText, type ImportedPageMetadata } from "./importResolvers";

// MakerWorld's own website (makerworld.com) sits behind Cloudflare bot management and a
// separate Geetest CAPTCHA on its download-resolution endpoints. api.bambulab.com is the
// same Bambu Cloud backend the official apps (Bambu Studio, Bambu Handy) talk to -- same
// account, same bearer token -- but isn't behind either defense. Confirmed against live
// traffic; the same finding is independently documented by other reverse-engineering
// projects (kloshi-io/makerworld-api-reverse, maziggy/bambuddy, Pr0zak/YASTL).
const DESIGN_API_BASE = "https://api.bambulab.com/v1/design-service";
const PROFILE_DOWNLOAD_BASE = "https://api.bambulab.com/v1/iot-service/api/user/profile";
const CLOUD_API_TIMEOUT_MS = IMPORT_TIMEOUT_SECONDS * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloudApiHeaders(bearerToken: string): Record<string, string> {
  return {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "application/json,text/plain,*/*",
    Authorization: `Bearer ${bearerToken}`,
    Referer: "https://makerworld.com/",
  };
}

async function fetchCloudJson(
  url: string,
  bearerToken: string,
): Promise<{ status: number; data: unknown } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOUD_API_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: cloudApiHeaders(bearerToken), redirect: "follow", signal: controller.signal });
    const text = await res.text();
    let data: unknown = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return { status: res.status, data };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Users paste the raw browser `Cookie:` header into Settings (unchanged UX) -- this pulls
 * just the `token` value out of it to use as a Bearer credential against api.bambulab.com,
 * or accepts a bare pasted token directly (no `;`/`=`/whitespace) as a convenience. */
export function extractMakerworldBearerToken(rawCookieOrToken: string | null | undefined): string | null {
  const raw = (rawCookieOrToken || "").trim();
  if (!raw) return null;
  const match = raw.match(/(?:^|;\s*)token=([^;]+)/);
  if (match) {
    const value = match[1].trim();
    if (value) return value;
  }
  if (!raw.includes(";") && !raw.includes("=") && !/\s/.test(raw)) {
    return raw;
  }
  return null;
}

export function parseMakerworldModelUrl(url: string): { designId: string; requestedInstanceId: string | null } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.hostname.toLowerCase().endsWith("makerworld.com")) return null;
  const designMatch = parsed.pathname.match(/\/models?\/(\d+)/i);
  if (!designMatch) return null;
  const hashMatch = parsed.hash.match(/profileid-(\d+)/i);
  return { designId: designMatch[1], requestedInstanceId: hashMatch ? hashMatch[1] : null };
}

// MakerWorld's anti-abuse layer (distinct from the Cloudflare edge) answers a flagged
// request with a well-formed JSON body naming a captchaId -- sometimes under HTTP 418,
// sometimes (as observed live) under a 200. It's account/IP-scoped, self-clears after a
// few hours of quiet traffic, and cannot be solved without a real browser. Detecting it by
// shape (not exact wording) and reporting it clearly, instead of letting it fall through
// as "no downloadable file found", mirrors maziggy/bambuddy's handling of the same
// upstream behavior (they hit and documented this independently, as issue #2790).
function isCaptchaChallenge(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const haystack = Object.entries(data)
    .map(([key, value]) => `${key} ${typeof value === "string" ? value : ""}`)
    .join(" ")
    .toLowerCase();
  return haystack.includes("captchaid") || haystack.includes("captcha") || haystack.includes("robot");
}

export const MAKERWORLD_CAPTCHA_MESSAGE =
  "MakerWorld is challenging this account with a CAPTCHA before it will hand over a download link. " +
  "This can't be solved automatically. Open the model on makerworld.com and click Download there " +
  "once -- that usually clears it -- then retry the import.";

// Once we've seen the challenge, stop sending more automated requests for a while instead
// of retrying into a deepening block (the exact mistake that extends these in practice).
const CAPTCHA_COOLOFF_MS = 5 * 60 * 1000;
let captchaBlockedUntil = 0;

export function makerworldCaptchaCooloffActive(): boolean {
  return Date.now() < captchaBlockedUntil;
}

function noteCaptchaChallenge(): void {
  captchaBlockedUntil = Date.now() + CAPTCHA_COOLOFF_MS;
}

export class MakerworldCaptchaError extends Error {
  constructor() {
    super(MAKERWORLD_CAPTCHA_MESSAGE);
    this.name = "MakerworldCaptchaError";
  }
}

export class MakerworldAuthError extends Error {
  constructor() {
    super("Your MakerWorld session has expired or was rejected. Update the cookie in Settings and try again.");
    this.name = "MakerworldAuthError";
  }
}

export type MakerworldCloudResolution = {
  downloadUrl: string;
  meta: ImportedPageMetadata;
};

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Resolves a MakerWorld design to a real, directly-downloadable (signed S3) URL entirely
 * through api.bambulab.com -- no Cloudflare, no cookie-gated web session, no HTML scraping.
 * Returns null for anything that should fall back to the existing page-scraping resolver
 * (missing/malformed data); throws MakerworldCaptchaError/MakerworldAuthError for the two
 * failure shapes worth telling the user about specifically.
 */
export async function resolveMakerworldViaCloudApi(
  designId: string,
  requestedInstanceId: string | null,
  bearerToken: string,
): Promise<MakerworldCloudResolution | null> {
  if (makerworldCaptchaCooloffActive()) throw new MakerworldCaptchaError();

  const designResult = await fetchCloudJson(`${DESIGN_API_BASE}/design/${designId}`, bearerToken);
  if (!designResult) return null;
  if (isCaptchaChallenge(designResult.data)) {
    noteCaptchaChallenge();
    throw new MakerworldCaptchaError();
  }
  if (designResult.status === 401 || designResult.status === 403) throw new MakerworldAuthError();
  if (designResult.status !== 200 || !isRecord(designResult.data)) return null;
  const design = designResult.data;

  const modelId = typeof design.modelId === "string" && design.modelId.trim() ? design.modelId.trim() : null;
  if (!modelId) return null;

  const instances = Array.isArray(design.instances) ? design.instances.filter(isRecord) : [];
  const defaultInstanceId = design.defaultInstanceId != null ? String(design.defaultInstanceId) : null;

  let selected: Record<string, unknown> | null = null;
  if (requestedInstanceId) {
    selected = instances.find((inst) => String(inst.id) === requestedInstanceId) ?? null;
  }
  if (!selected && defaultInstanceId) {
    selected = instances.find((inst) => String(inst.id) === defaultInstanceId) ?? null;
  }
  if (!selected) {
    selected = instances[0] ?? null;
  }
  if (!selected) return null;

  const profileId = selected.profileId != null ? String(selected.profileId) : null;
  if (!profileId) return null;

  const downloadResult = await fetchCloudJson(
    `${PROFILE_DOWNLOAD_BASE}/${profileId}?model_id=${encodeURIComponent(modelId)}`,
    bearerToken,
  );
  if (!downloadResult) return null;
  if (isCaptchaChallenge(downloadResult.data)) {
    noteCaptchaChallenge();
    throw new MakerworldCaptchaError();
  }
  if (downloadResult.status === 401 || downloadResult.status === 403) throw new MakerworldAuthError();
  if (downloadResult.status !== 200 || !isRecord(downloadResult.data)) return null;
  const body = downloadResult.data;
  if (body.message !== "success" || typeof body.url !== "string" || !body.url.trim()) return null;

  const tags = Array.isArray(design.tags)
    ? design.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim())
    : [];
  const summary = typeof design.summary === "string" ? design.summary : null;
  const creator = isRecord(design.designCreator) ? pickString(design.designCreator, ["nickName", "name", "handle"]) : null;
  const previewImageUrl = pickString(design, ["coverUrl", "coverPortrait", "coverLandscape"]);
  const title = pickString(design, ["title"]);

  return {
    downloadUrl: body.url,
    meta: {
      title: title ? decodeHtmlEntities(title) : null,
      tags,
      description: summary ? htmlToPlainText(summary) : null,
      creator,
      previewImageUrl,
      filename: pickString(body, ["filename"]),
    },
  };
}

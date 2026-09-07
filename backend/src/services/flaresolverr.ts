import { FLARESOLVERR_SESSION_TTL_MS, FLARESOLVERR_TIMEOUT_MS, FLARESOLVERR_URL } from "../config";

export function isFlaresolverrEnabled(): boolean {
  return Boolean(FLARESOLVERR_URL);
}

/** True when a response looks like a Cloudflare edge block/challenge rather than an
 * application-level 403 (wrong credentials, missing auth, etc). Only these are worth
 * paying FlareSolverr's solve cost for. */
export function looksLikeCloudflareBlock(headers: Headers): boolean {
  const server = (headers.get("server") || "").toLowerCase();
  if (server.includes("cloudflare")) return true;
  if (headers.has("cf-mitigated")) return true;
  return false;
}

function parseCookieHeader(raw: string | null | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of (raw || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    jar[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return jar;
}

// Cloudflare's clearance here is bound to the exact browser fingerprint that solved the
// challenge, so replaying its cookies via our own fetch() does not work (verified against
// makerworld.com). Once a host is seen blocking us, every request to it is proxied through
// FlareSolverr's real headless browser instead, for a TTL, rather than re-probing with a
// wasted direct request each time.
const proxyHosts = new Map<string, number>();

export function shouldProxyHost(hostname: string): boolean {
  const expiresAt = proxyHosts.get(hostname.toLowerCase());
  return typeof expiresAt === "number" && Date.now() > 0 && Date.now() < expiresAt;
}

function markHostNeedsProxy(hostname: string): void {
  proxyHosts.set(hostname.toLowerCase(), Date.now() + FLARESOLVERR_SESSION_TTL_MS);
}

export type FlaresolverrResult = {
  status: number;
  body: string;
};

/** Loads `url` inside FlareSolverr's real headless browser (passing Cloudflare's JS/managed
 * challenge along the way) and returns the page body it rendered. GET only: FlareSolverr's
 * POST command submits a browser form, not a raw JSON body, so it isn't used here. */
export async function fetchViaFlaresolverr(url: string, cookieHeader?: string | null): Promise<FlaresolverrResult | null> {
  if (!FLARESOLVERR_URL) return null;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLARESOLVERR_TIMEOUT_MS);
  try {
    const seedCookies = parseCookieHeader(cookieHeader);
    const cookieList = Object.entries(seedCookies).map(([name, value]) => ({ name, value, domain: hostname }));
    const body: Record<string, unknown> = {
      cmd: "request.get",
      url,
      maxTimeout: FLARESOLVERR_TIMEOUT_MS,
    };
    if (cookieList.length) body.cookies = cookieList;

    const res = await fetch(FLARESOLVERR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      solution?: { status?: number; response?: string };
    };
    if (data.status !== "ok" || !data.solution) return null;

    markHostNeedsProxy(hostname);
    return { status: data.solution.status ?? 200, body: data.solution.response || "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** FlareSolverr's captured body is what the browser rendered, so a JSON API response comes
 * back as Chrome's own JSON-viewer DOM (`<html>...<pre>{...}</pre>...</html>`) rather than
 * raw JSON text. Unwraps that, HTML-entity-decodes it, and parses it. */
export function extractJsonFromBrowserBody(body: string): unknown | null {
  const trimmed = body.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to unwrap
  }
  const match = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) return null;
  const unescaped = match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  try {
    return JSON.parse(unescaped);
  } catch {
    return null;
  }
}

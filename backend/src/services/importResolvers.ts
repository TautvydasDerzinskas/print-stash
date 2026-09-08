import path from "node:path";
import * as cheerio from "cheerio";
import {
  IMPORT_ALLOWED_EXTS,
  IMPORT_BLOCKED_EXTS,
  IMPORT_BROWSER_USER_AGENT,
  IMPORT_EXT_PRIORITY,
  IMPORT_HTML_MAX_BYTES,
  IMPORT_TIMEOUT_SECONDS,
  IMPORT_USER_AGENT,
} from "../config";
import { HttpError, isJsonContentType } from "../utils/fileUtils";
import {
  extractJsonFromBrowserBody,
  fetchViaFlaresolverr,
  isFlaresolverrEnabled,
  looksLikeCloudflareBlock,
  shouldProxyHost,
} from "./flaresolverr";

export type ImportCookies = {
  makerworld_cookie?: string | null;
  thingiverse_cookie?: string | null;
};

function firstNonEmptyLine(raw: string): string | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  let value = lines[0];
  for (const line of lines) {
    if (line.toLowerCase().startsWith("cookie:")) {
      value = line.slice("cookie:".length).trim();
      break;
    }
  }
  return value || null;
}

export function resolveMakerworldCookie(body: ImportCookies): string | null {
  const raw = (body.makerworld_cookie || process.env.MAKERWORLD_COOKIE || "").trim();
  if (!raw) return null;
  return firstNonEmptyLine(raw);
}

export function resolveThingiverseCookie(body: ImportCookies): string | null {
  const raw = (body.thingiverse_cookie || process.env.THINGIVERSE_COOKIE || "").trim();
  if (!raw) return null;
  return firstNonEmptyLine(raw);
}

export function makerworldHtmlHeaders(referer?: string | null, cookie?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };
  if (referer) headers.Referer = referer;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function makerworldApiHeaders(referer?: string | null, nonce?: string | null, cookie?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "X-BBL-Client-Type": "web",
    "X-BBL-Client-Version": "00.00.00.01",
    "X-BBL-App-Source": "makerworld",
    "X-BBL-Client-Name": "MakerWorld",
  };
  if (referer) headers.Referer = referer;
  if (nonce) headers["X-Nonce"] = nonce;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

export function isPrintablesPageHost(host: string): boolean {
  const lowered = (host || "").toLowerCase();
  return lowered === "printables.com" || lowered === "www.printables.com";
}

export function printablesHtmlHeaders(referer?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
  };
  if (referer) headers.Referer = referer;
  return headers;
}

export function isThingiversePageHost(host: string): boolean {
  const lowered = (host || "").toLowerCase();
  return lowered === "thingiverse.com" || lowered === "www.thingiverse.com";
}

export function thingiverseHtmlHeaders(referer?: string | null, cookie?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
  };
  if (referer) headers.Referer = referer;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function thingiverseApiHeaders(referer?: string | null, cookie?: string | null, token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://www.thingiverse.com",
  };
  if (referer) headers.Referer = referer;
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// -- Small bounded fetch helpers (used only for resolver-side HTML/JSON probes; the actual
// model-file download streams straight to disk in importService.ts, not through here). ------

async function rawFetchBuffer(
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: string },
): Promise<{ status: number; headers: Headers; buffer: Buffer; url: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_SECONDS * 1000);
  try {
    const res = await fetch(url, {
      method: init?.method || "GET",
      headers,
      body: init?.body,
      redirect: "follow",
      signal: controller.signal,
    });
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return { status: res.status, headers: res.headers, buffer, url: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Loads `url` through FlareSolverr's real browser (GET only - its POST command submits a
 * browser form, not a raw JSON body, so callers with a POST init fall back to a direct
 * request instead). Unwraps the JSON it renders back into the same {status, headers, buffer,
 * url} shape rawFetchBuffer returns, so callers don't need to know which path served them. */
async function proxiedBuffer(
  url: string,
  cookieHeader?: string | null,
): Promise<{ status: number; headers: Headers; buffer: Buffer; url: string } | null> {
  const solved = await fetchViaFlaresolverr(url, cookieHeader);
  if (!solved) return null;
  const json = extractJsonFromBrowserBody(solved.body);
  const bodyText = json !== null ? JSON.stringify(json) : solved.body;
  const contentType = json !== null ? "application/json" : "text/html; charset=utf-8";
  return {
    status: solved.status,
    headers: new Headers({ "content-type": contentType }),
    buffer: Buffer.from(bodyText, "utf-8"),
    url,
  };
}

async function fetchCappedBuffer(
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: string },
): Promise<{ status: number; headers: Headers; buffer: Buffer; url: string } | null> {
  const isGet = !init?.method || init.method.toUpperCase() === "GET";
  if (!isGet || !isFlaresolverrEnabled()) {
    return rawFetchBuffer(url, headers, init);
  }

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return rawFetchBuffer(url, headers, init);
  }

  if (shouldProxyHost(hostname)) {
    return (await proxiedBuffer(url, headers.Cookie)) || rawFetchBuffer(url, headers, init);
  }

  const result = await rawFetchBuffer(url, headers, init);
  if (result && result.status === 403 && looksLikeCloudflareBlock(result.headers)) {
    const proxied = await proxiedBuffer(url, headers.Cookie);
    if (proxied) return proxied;
  }
  return result;
}

function parseJsonErrorMessage(raw: Buffer): string | null {
  try {
    const data = JSON.parse(raw.toString("utf-8"));
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const key of ["error", "detail", "message"]) {
        const value = (data as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchJsonFromUrl(
  url: string,
  referer?: string | null,
  headers?: Record<string, string>,
): Promise<unknown | null> {
  const requestHeaders: Record<string, string> = { "User-Agent": IMPORT_USER_AGENT, Accept: "application/json" };
  if (referer) requestHeaders.Referer = referer;
  if (headers) Object.assign(requestHeaders, headers);
  const result = await fetchCappedBuffer(url, requestHeaders);
  if (!result) return null;
  if (result.buffer.length > IMPORT_HTML_MAX_BYTES) return null;
  const contentType = result.headers.get("content-type") || "";
  if (!isJsonContentType(contentType)) {
    const trimmed = result.buffer.toString("utf-8").trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  }
  try {
    return JSON.parse(result.buffer.toString("utf-8"));
  } catch {
    return null;
  }
}

// -- Generic download-link sniffing (non-site-specific) --------------------------------------

function scoreDownloadUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (lower.includes("download")) score += 6;
  if (lower.includes("files")) score += 2;
  IMPORT_EXT_PRIORITY.forEach((ext, idx) => {
    if (lower.includes(ext)) score += (IMPORT_EXT_PRIORITY.length - idx) * 10;
  });
  return score;
}

function isPotentialUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  if (/[<>{}"\\^`]/.test(value)) return false;
  return true;
}

function containsAllowedExt(url: string): boolean {
  const lower = url.toLowerCase();
  for (const ext of IMPORT_ALLOWED_EXTS) {
    const re = new RegExp(`${ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[?#&])`);
    if (re.test(lower)) return true;
  }
  return false;
}

function isAllowedDownloadCandidate(url: string): boolean {
  const lower = url.toLowerCase();
  let ext = "";
  try {
    ext = path.extname(new URL(url).pathname).toLowerCase();
  } catch {
    ext = "";
  }
  if (ext) {
    if (IMPORT_ALLOWED_EXTS.has(ext)) return true;
    if (IMPORT_BLOCKED_EXTS.has(ext)) return false;
    if (lower.includes("download")) return true;
    return containsAllowedExt(lower);
  }
  if (containsAllowedExt(lower)) return true;
  return lower.includes("download");
}

/** Collects href/src/data-* link-ish attributes from every element in the page (a faithful
 * DOM-based port of MakersVault's LinkCollector, using cheerio instead of HTMLParser). */
function collectPageLinks(html: string): string[] {
  const links: string[] = [];
  const attrNames = ["href", "src", "data-download", "data-download-url", "data-url", "data-file", "data-href"];
  try {
    const $ = cheerio.load(html);
    $("*").each((_, el) => {
      const attribs = (el as unknown as { attribs?: Record<string, string> }).attribs;
      if (!attribs) return;
      for (const name of attrNames) {
        const value = attribs[name];
        if (value) links.push(value);
      }
    });
  } catch {
    // ignore malformed HTML, fall through with whatever we collected
  }
  return links;
}

export function findDownloadUrl(html: string, baseUrl: string): string | null {
  const links = collectPageLinks(html);
  const urlMatches = html.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  links.push(...urlMatches);

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const rawLink of links) {
    const link = (rawLink || "").trim();
    if (!link || link.startsWith("#")) continue;
    if (/^javascript:/i.test(link) || /^mailto:/i.test(link)) continue;
    let absUrl: string;
    try {
      absUrl = new URL(link, baseUrl).toString();
    } catch {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(absUrl);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (seen.has(absUrl)) continue;
    seen.add(absUrl);
    if (isAllowedDownloadCandidate(absUrl)) candidates.push(absUrl);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreDownloadUrl(b) - scoreDownloadUrl(a));
  return candidates[0];
}

function normalizeCandidateUrl(raw: string, baseUrl: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  if (!isPotentialUrl(value)) return null;
  let candidate = value;
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return isAllowedDownloadCandidate(candidate) ? candidate : null;
  }
  if (candidate.startsWith("/") || candidate.includes("/")) {
    try {
      const abs = new URL(candidate, baseUrl).toString();
      return isAllowedDownloadCandidate(abs) ? abs : null;
    } catch {
      return null;
    }
  }
  return null;
}

function findDownloadUrlInJson(data: unknown, baseUrl: string): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [data];
  while (stack.length) {
    const current = stack.pop();
    if (current && typeof current === "object" && !Array.isArray(current)) {
      stack.push(...Object.values(current as Record<string, unknown>));
    } else if (Array.isArray(current)) {
      stack.push(...current);
    } else if (typeof current === "string") {
      if (seen.has(current)) continue;
      seen.add(current);
      const url = normalizeCandidateUrl(current, baseUrl);
      if (url) candidates.push(url);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreDownloadUrl(b) - scoreDownloadUrl(a));
  return candidates[0];
}

function extractDownloadUrlFromResponse(data: unknown, baseUrl: string): string | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const dict = data as Record<string, unknown>;
    for (const key of ["url", "downloadUrl", "download_url"]) {
      const value = dict[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    const inner = dict.data;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const innerDict = inner as Record<string, unknown>;
      for (const key of ["url", "downloadUrl", "download_url"]) {
        const value = innerDict[key];
        if (typeof value === "string" && value.trim()) return value;
      }
    }
  }
  return findDownloadUrlInJson(data, baseUrl);
}

// -- MakerWorld --------------------------------------------------------------------------------

function extractNextDataJson(html: string): unknown | null {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  const raw = (match[1] || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getPath(obj: unknown, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function makerworldDesignIdFromNextData(data: unknown): string | null {
  const designId = getPath(data, "props", "pageProps", "design", "id");
  return designId ? String(designId) : null;
}

function makerworldTitleFromNextData(data: unknown): string | null {
  const title = getPath(data, "props", "pageProps", "design", "title");
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function makerworldTagsFromNextData(data: unknown): string[] {
  const tags = getPath(data, "props", "pageProps", "design", "tags");
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim());
}

function makerworldCreatorFromNextData(data: unknown): string | null {
  const creator = getPath(data, "props", "pageProps", "design", "designCreator") as Record<string, unknown> | undefined;
  if (!creator) return null;
  for (const key of ["nickName", "name", "handle"]) {
    const value = creator[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function makerworldCoverUrlFromNextData(data: unknown): string | null {
  for (const key of ["coverUrl", "coverPortrait", "coverLandscape"]) {
    const value = getPath(data, "props", "pageProps", "design", key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** MakerWorld's design summary is a small HTML fragment (paragraphs, links, embedded figures).
 * Converts it to plain text for Print.notes: turns block-level closing tags into line breaks,
 * strips every remaining tag, decodes entities, and collapses the resulting whitespace. */
export function htmlToPlainText(html: string): string | null {
  const withBreaks = html
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const text = decodeHtmlEntities(withBreaks)
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function makerworldDescriptionFromNextData(data: unknown): string | null {
  const summary = getPath(data, "props", "pageProps", "design", "summary");
  if (typeof summary !== "string" || !summary.trim()) return null;
  return htmlToPlainText(summary);
}

function genericTitleFromHtml(html: string): string | null {
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  if (ogMatch && ogMatch[1].trim()) return decodeHtmlEntities(ogMatch[1].trim());
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1].trim()) return decodeHtmlEntities(titleMatch[1].trim());
  return null;
}

export type ImportedPageMetadata = {
  title: string | null;
  tags: string[];
  description: string | null;
  creator: string | null;
  previewImageUrl: string | null;
  /** A known-clean filename for the resolved download, when the resolver already has one
   * (e.g. from the MakerWorld cloud API's own response) rather than needing to guess one from
   * the download URL's path or a Content-Disposition header. */
  filename: string | null;
  /** The page's photo gallery, if any -- distinct from previewImageUrl (the single cover
   * image used as the plate thumbnail). Everything here is meant to be attached as supporting
   * files instead. */
  galleryImages: { url: string; filename: string }[];
  /** The richer, structured creator record (for the Author table) -- distinct from `creator`,
   * which stays a plain display string for backward compatibility and non-provider sources. */
  author: ImportedAuthorInfo | null;
  /** The source site's own category ids for this model (e.g. MakerWorld's `design.categories`),
   * paired with which site they belong to -- each site has its own independent id namespace, so
   * both are needed to match against the right Folder.*CatId column (see importService.ts's
   * resolveFolderIdByCategory). Empty/null when the resolver doesn't expose categories. */
  siteCategoryIds: number[];
  categorySite: "makerworld" | "thingiverse" | "printables" | null;
};

export type ImportedAuthorInfo = {
  provider: string;
  externalId: string;
  name: string | null;
  handle: string | null;
  bio: string | null;
  bioTranslated: string | null;
  links: string[];
  avatarUrl: string | null;
  backgroundUrl: string | null;
};

export function emptyImportedPageMetadata(): ImportedPageMetadata {
  return {
    title: null,
    tags: [],
    description: null,
    creator: null,
    previewImageUrl: null,
    filename: null,
    galleryImages: [],
    author: null,
    siteCategoryIds: [],
    categorySite: null,
  };
}

/** Best-effort metadata for a landing page, used to fill in the Print when the caller didn't
 * supply a field explicitly. MakerWorld exposes title/tags/summary/creator/cover image directly
 * on the design object in its NEXT_DATA blob; everywhere else only title is filled in, via the
 * page's og:title/<title> (still far more useful than the internal filename of whatever the
 * page links to). */
export function extractPageMetadata(html: string, pageHost: string): ImportedPageMetadata {
  const meta = emptyImportedPageMetadata();
  if (pageHost.endsWith("makerworld.com")) {
    const nextData = extractNextDataJson(html);
    if (nextData) {
      meta.title = makerworldTitleFromNextData(nextData);
      meta.tags = makerworldTagsFromNextData(nextData);
      meta.description = makerworldDescriptionFromNextData(nextData);
      meta.creator = makerworldCreatorFromNextData(nextData);
      meta.previewImageUrl = makerworldCoverUrlFromNextData(nextData);
    }
  }
  if (!meta.title) meta.title = genericTitleFromHtml(html);
  return meta;
}

function makerworldInstanceIdFromNextData(data: unknown): string | null {
  const design = getPath(data, "props", "pageProps", "design") as Record<string, unknown> | undefined;
  if (!design) return null;
  const defaultInstance = design.defaultInstanceId;
  if (defaultInstance) return String(defaultInstance);
  const instances = design.instances;
  if (Array.isArray(instances)) {
    for (const inst of instances) {
      if (inst && typeof inst === "object" && (inst as Record<string, unknown>).id) {
        return String((inst as Record<string, unknown>).id);
      }
    }
  }
  return null;
}

function makerworldNonceFromNextData(data: unknown): string | null {
  const nonce = getPath(data, "props", "pageProps", "x-nonce");
  return typeof nonce === "string" && nonce.trim() ? nonce : null;
}

function makerworldModelIdFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/models\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchMakerworldInstanceDownloadUrl(
  instanceId: string,
  pageUrl: string,
  cookie: string | null,
): Promise<string | null> {
  const apiUrl = `https://makerworld.com/api/v1/design-service/instance/${instanceId}/f3mf?type=download&fileType=3mfstl`;
  const data = await fetchJsonFromUrl(apiUrl, pageUrl, makerworldApiHeaders(pageUrl, null, cookie));
  return data ? extractDownloadUrlFromResponse(data, apiUrl) : null;
}

async function fetchMakerworldModelDownloadUrl(
  modelId: string,
  pageUrl: string,
  nonce: string | null,
  cookie: string | null,
): Promise<string | null> {
  const apiUrl = `https://makerworld.com/api/v1/models/${modelId}/download`;
  const data = await fetchJsonFromUrl(apiUrl, pageUrl, makerworldApiHeaders(pageUrl, nonce, cookie));
  return data ? extractDownloadUrlFromResponse(data, apiUrl) : null;
}

export async function resolveMakerworldDownloadUrl(
  html: string,
  pageUrl: string,
  makerworldCookie: string | null,
): Promise<string | null> {
  const nextData = extractNextDataJson(html);
  let designId: string | null = null;
  let nonce: string | null = null;
  let instanceId: string | null = null;
  if (nextData) {
    const url = findDownloadUrlInJson(nextData, pageUrl);
    if (url) return url;
    designId = makerworldDesignIdFromNextData(nextData);
    nonce = makerworldNonceFromNextData(nextData);
    instanceId = makerworldInstanceIdFromNextData(nextData);
  }

  if (instanceId) {
    const url = await fetchMakerworldInstanceDownloadUrl(instanceId, pageUrl, makerworldCookie);
    if (url) return url;
  }

  const modelId = designId || makerworldModelIdFromUrl(pageUrl);
  if (!modelId) return null;
  const url = await fetchMakerworldModelDownloadUrl(modelId, pageUrl, nonce, makerworldCookie);
  if (url) return url;

  const apiCandidates = [
    `https://makerworld.com/api/v1/models/${modelId}`,
    `https://makerworld.com/api/v1/models/${modelId}/files`,
    `https://makerworld.com/api/v1/model/${modelId}`,
    `https://makerworld.com/api/v1/model/${modelId}/files`,
  ];
  for (const apiUrl of apiCandidates) {
    const data = await fetchJsonFromUrl(apiUrl, pageUrl);
    if (!data) continue;
    const found = findDownloadUrlInJson(data, apiUrl);
    if (found) return found;
  }
  return null;
}

// -- Printables --------------------------------------------------------------------------------

function printablesModelIdFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/model\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchPrintablesGraphql(query: string, variables: Record<string, unknown>, referer: string | null): Promise<unknown | null> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://www.printables.com",
  };
  if (referer) headers.Referer = referer;
  const result = await fetchCappedBuffer("https://api.printables.com/graphql/", headers, {
    method: "POST",
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  if (!result) return null;
  if (result.status >= 400) {
    const message = parseJsonErrorMessage(result.buffer);
    if ([401, 403, 429].includes(result.status)) {
      throw new HttpError(result.status, message || "Printables request failed");
    }
    return null;
  }
  if (result.buffer.length > IMPORT_HTML_MAX_BYTES) return null;
  try {
    return JSON.parse(result.buffer.toString("utf-8"));
  } catch {
    return null;
  }
}

function parsePrintablesErrorMessages(errors: unknown): string | null {
  if (!Array.isArray(errors)) return null;
  const messages: string[] = [];
  for (const err of errors) {
    if (!err || typeof err !== "object") continue;
    const values = (err as Record<string, unknown>).messages;
    if (Array.isArray(values)) {
      for (const v of values) if (typeof v === "string" && v.trim()) messages.push(v.trim());
    } else if (typeof values === "string" && values.trim()) {
      messages.push(values.trim());
    }
  }
  return messages.length ? messages.join(", ") : null;
}

function selectBestDownloadLink(links: string[]): string | null {
  const candidates = links.filter((l) => isAllowedDownloadCandidate(l));
  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreDownloadUrl(b) - scoreDownloadUrl(a));
  return candidates[0];
}

function extractPrintablesIds(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const item of items) {
    if (item && typeof item === "object" && (item as Record<string, unknown>).id !== undefined) {
      ids.push(String((item as Record<string, unknown>).id));
    }
  }
  return ids;
}

async function fetchPrintablesModelMeta(printId: string, pageUrl: string): Promise<Record<string, unknown> | null> {
  const query = `
    query ($id: ID!) {
      print(id: $id) {
        id
        downloadPacks { id fileType }
        stls { id name }
      }
    }
  `;
  const data = (await fetchPrintablesGraphql(query, { id: printId }, pageUrl)) as
    | { data?: { print?: Record<string, unknown> } }
    | null;
  return data?.data?.print ?? null;
}

async function fetchPrintablesDownloadOutput(
  printId: string,
  variables: Record<string, unknown>,
  pageUrl: string,
): Promise<Record<string, unknown> | null> {
  const mutation = `
    mutation ($printId: ID!, $source: DownloadSourceEnum!, $fileType: DownloadFileTypeEnum, $id: ID, $files: [DownloadFileInput!]) {
      getDownloadLink(printId: $printId, source: $source, fileType: $fileType, id: $id, files: $files) {
        ok
        errors { field messages code }
        output { link files { id link fileType } }
      }
    }
  `;
  const data = (await fetchPrintablesGraphql(mutation, variables, pageUrl)) as
    | { data?: { getDownloadLink?: Record<string, unknown> } }
    | null;
  const result = data?.data?.getDownloadLink;
  if (!result) return null;
  if (result.ok === false) {
    const message = parsePrintablesErrorMessages(result.errors);
    if (message) throw new HttpError(400, message);
    return null;
  }
  const output = result.output;
  return output && typeof output === "object" ? (output as Record<string, unknown>) : null;
}

function collectPrintablesLinks(output: Record<string, unknown> | null): string[] {
  if (!output) return [];
  const links: string[] = [];
  if (typeof output.link === "string") links.push(output.link);
  const files = output.files;
  if (Array.isArray(files)) {
    for (const entry of files) {
      if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).link === "string") {
        links.push((entry as Record<string, unknown>).link as string);
      }
    }
  }
  return links;
}

export async function resolvePrintablesDownloadUrl(pageUrl: string): Promise<string | null> {
  const printId = printablesModelIdFromUrl(pageUrl);
  if (!printId) return null;
  const meta = await fetchPrintablesModelMeta(printId, pageUrl);
  if (!meta) return null;

  const packs = meta.downloadPacks;
  let packId: string | null = null;
  if (Array.isArray(packs)) {
    for (const pack of packs) {
      if (pack && typeof pack === "object" && (pack as Record<string, unknown>).fileType === "MODEL_FILES" && (pack as Record<string, unknown>).id) {
        packId = String((pack as Record<string, unknown>).id);
        break;
      }
    }
    if (!packId && packs.length) {
      for (const pack of packs) {
        if (pack && typeof pack === "object" && (pack as Record<string, unknown>).id) {
          packId = String((pack as Record<string, unknown>).id);
          break;
        }
      }
    }
  }

  if (packId) {
    const output = await fetchPrintablesDownloadOutput(
      printId,
      { printId, source: "model_detail", fileType: "pack", id: packId },
      pageUrl,
    );
    const best = selectBestDownloadLink(collectPrintablesLinks(output));
    if (best) return best;
  }

  const stlIds = extractPrintablesIds(meta.stls);
  if (stlIds.length) {
    const output = await fetchPrintablesDownloadOutput(
      printId,
      { printId, source: "model_detail", files: [{ fileType: "stl", ids: stlIds }] },
      pageUrl,
    );
    const best = selectBestDownloadLink(collectPrintablesLinks(output));
    if (best) return best;
  }

  return null;
}

// -- Thingiverse -------------------------------------------------------------------------------

function thingiverseThingIdFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const m1 = pathname.match(/thing:(\d+)/i);
    if (m1) return m1[1];
    const m2 = pathname.match(/\/things\/(\d+)/i);
    return m2 ? m2[1] : null;
  } catch {
    return null;
  }
}

async function fetchThingiverseJson(
  url: string,
  pageUrl: string,
  cookie: string | null,
  token: string | null,
): Promise<unknown | null> {
  const result = await fetchCappedBuffer(url, thingiverseApiHeaders(pageUrl, cookie, token));
  if (!result) return null;
  if (result.status >= 400) {
    const message = parseJsonErrorMessage(result.buffer);
    if ([401, 403, 429].includes(result.status)) {
      throw new HttpError(result.status, message || "Thingiverse request failed");
    }
    return null;
  }
  if (result.buffer.length > IMPORT_HTML_MAX_BYTES) return null;
  const contentType = result.headers.get("content-type") || "";
  if (!isJsonContentType(contentType)) {
    const trimmed = result.buffer.toString("utf-8").trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  }
  try {
    return JSON.parse(result.buffer.toString("utf-8"));
  } catch {
    return null;
  }
}

async function fetchThingiverseViewToken(pageUrl: string, cookie: string | null): Promise<string | null> {
  const apiUrl = "https://www.thingiverse.com/api/v2/auth/view";
  const result = await fetchCappedBuffer(apiUrl, thingiverseApiHeaders(pageUrl, cookie));
  if (!result) return null;
  if (result.status >= 400) {
    const message = parseJsonErrorMessage(result.buffer);
    if ([401, 403, 429].includes(result.status)) {
      throw new HttpError(
        result.status,
        message ||
          "Thingiverse blocked the request. Paste the Cookie header from your browser session in Settings to import.",
      );
    }
    return null;
  }
  if (result.buffer.length > IMPORT_HTML_MAX_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(result.buffer.toString("utf-8"));
  } catch {
    return null;
  }
  if (data && typeof data === "object") {
    const dict = data as Record<string, unknown>;
    const token = dict.access || dict.token || dict.access_token;
    if (typeof token === "string" && token.trim()) return token.trim();
    const inner = dict.data;
    if (inner && typeof inner === "object") {
      const innerDict = inner as Record<string, unknown>;
      const innerToken = innerDict.access || innerDict.token || innerDict.access_token;
      if (typeof innerToken === "string" && innerToken.trim()) return innerToken.trim();
    }
  }
  return null;
}

export async function resolveThingiverseDownloadUrl(pageUrl: string, thingiverseCookie: string | null): Promise<string | null> {
  const thingId = thingiverseThingIdFromUrl(pageUrl);
  if (!thingId) return null;
  const token = await fetchThingiverseViewToken(pageUrl, thingiverseCookie);
  if (!token) {
    if (!thingiverseCookie) {
      throw new HttpError(403, "Thingiverse requires a session cookie to fetch download links.");
    }
    return null;
  }
  const apiCandidates = [
    `https://www.thingiverse.com/api/v2/things/${thingId}/files`,
    `https://www.thingiverse.com/api/v2/things/${thingId}`,
  ];
  for (const apiUrl of apiCandidates) {
    const data = await fetchThingiverseJson(apiUrl, pageUrl, thingiverseCookie, token);
    if (!data) continue;
    const url = findDownloadUrlInJson(data, apiUrl);
    if (url) return url;
  }
  return `https://www.thingiverse.com/thing:${thingId}/zip`;
}

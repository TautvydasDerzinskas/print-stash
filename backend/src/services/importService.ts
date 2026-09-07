import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  IMPORT_HTML_MAX_BYTES,
  IMPORT_MAX_BYTES,
  IMPORT_TIMEOUT_SECONDS,
  IMPORT_USER_AGENT,
} from "../config";
import { HttpError, buildImportFilename, isHtmlContentType, mimeFromContentType } from "../utils/fileUtils";
import { validateRemoteUrl } from "../utils/urlUtils";
import { fetchViaFlaresolverr, isFlaresolverrEnabled, looksLikeCloudflareBlock, shouldProxyHost } from "./flaresolverr";
import {
  emptyImportedPageMetadata,
  extractPageMetadata,
  findDownloadUrl,
  isPrintablesPageHost,
  isThingiversePageHost,
  makerworldHtmlHeaders,
  printablesHtmlHeaders,
  resolveMakerworldCookie,
  resolveMakerworldDownloadUrl,
  resolvePrintablesDownloadUrl,
  resolveThingiverseCookie,
  resolveThingiverseDownloadUrl,
  thingiverseHtmlHeaders,
  type ImportCookies,
  type ImportedPageMetadata,
} from "./importResolvers";
import { createPrint, type PrintMetaInput } from "./printCreation";
import { plateThumbExists, saveThumbFromBytes } from "./printService";
import type { Plate, Print } from "@prisma/client";

export type ImportRequestBody = ImportCookies & {
  url: string;
  title?: string | null;
  notes?: string | null;
  tags?: string[];
  folder_id?: string | null;
  filename?: string | null;
};

function parseCharset(contentType: string | null): string {
  if (!contentType) return "utf-8";
  const match = contentType.match(/charset=([^;]+)/i);
  return match ? match[1].trim().replace(/["']/g, "") : "utf-8";
}

async function readCapped(response: Response, maxBytes: number): Promise<{ buffer: Buffer; truncated: boolean }> {
  if (!response.body) return { buffer: Buffer.alloc(0), truncated: false };
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      const allowed = chunk.length - (total - maxBytes);
      if (allowed > 0) chunks.push(chunk.subarray(0, allowed));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), truncated };
}

async function rawFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_SECONDS * 1000);
  try {
    return await fetch(url, { headers, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Loads `url` through FlareSolverr's real browser and wraps the rendered body as an HTML
 * Response, so callers (openImportResponse's page-scraping path) can treat it exactly like
 * an ordinary fetch result. */
async function proxiedResponse(url: string, cookieHeader?: string | null): Promise<Response | null> {
  const solved = await fetchViaFlaresolverr(url, cookieHeader);
  if (!solved) return null;
  return new Response(solved.body, {
    status: solved.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function fetchWithGuard(url: string, headers: Record<string, string>): Promise<Response> {
  try {
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      // validateRemoteUrl already rejects unparsable URLs upstream
    }

    let res: Response;
    if (isFlaresolverrEnabled() && shouldProxyHost(hostname)) {
      res = (await proxiedResponse(url, headers.Cookie)) || (await rawFetch(url, headers));
    } else {
      res = await rawFetch(url, headers);
      if (res.status === 403 && isFlaresolverrEnabled() && looksLikeCloudflareBlock(res.headers)) {
        const proxied = await proxiedResponse(url, headers.Cookie);
        if (proxied) res = proxied;
      }
    }

    if (!res.ok) {
      throw new HttpError(res.status || 400, `Failed to fetch URL: ${res.statusText || res.status}`);
    }
    return res;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Failed to reach the provided URL");
  }
}

export type OpenImportResult = { response: Response; finalUrl: string; meta: ImportedPageMetadata };

/**
 * Fetches `url`, following HTML "landing pages" recursively (MakerWorld/Printables/Thingiverse
 * page scraping, or generic <a href>/JSON link sniffing) until it lands on the actual model file
 * response. Mirrors MakersVault's open_import_response. `inheritedMeta` carries the landing
 * page's real metadata (MakerWorld's design title/tags/summary/creator/cover image) down through
 * the recursive follow so the final file response can still report it even though the file host
 * itself has none of its own.
 */
export async function openImportResponse(
  url: string,
  body: ImportRequestBody,
  referer?: string | null,
  depth = 0,
  inheritedMeta: ImportedPageMetadata = emptyImportedPageMetadata(),
): Promise<OpenImportResult> {
  if (depth > 3) throw new HttpError(400, "Too many redirects while resolving download link");
  const validatedUrl = await validateRemoteUrl(url);

  const headers: Record<string, string> = { "User-Agent": IMPORT_USER_AGENT, Accept: "*/*" };
  let host = "";
  try {
    host = (new URL(validatedUrl).hostname || "").toLowerCase();
  } catch {
    host = "";
  }
  let makerworldCookie: string | null = null;
  let thingiverseCookie: string | null = null;
  if (host.endsWith("makerworld.com")) {
    makerworldCookie = resolveMakerworldCookie(body);
    Object.assign(headers, makerworldHtmlHeaders(referer || validatedUrl, makerworldCookie));
  } else if (isThingiversePageHost(host)) {
    thingiverseCookie = resolveThingiverseCookie(body);
    Object.assign(headers, thingiverseHtmlHeaders(referer || validatedUrl, thingiverseCookie));
  } else if (isPrintablesPageHost(host)) {
    Object.assign(headers, printablesHtmlHeaders(referer || validatedUrl));
  }
  if (referer) headers.Referer = referer;

  const res = await fetchWithGuard(validatedUrl, headers);
  const finalUrl = res.url || validatedUrl;
  await validateRemoteUrl(finalUrl);

  const contentType = res.headers.get("content-type") || "";
  if (isHtmlContentType(contentType)) {
    const { buffer, truncated } = await readCapped(res, IMPORT_HTML_MAX_BYTES);
    const html = buffer.toString(parseCharset(contentType) as BufferEncoding);

    let downloadUrl: string | null = null;
    let pageHost = "";
    try {
      pageHost = (new URL(finalUrl).hostname || "").toLowerCase();
    } catch {
      pageHost = "";
    }
    const extracted = extractPageMetadata(html, pageHost);
    const resolvedMeta: ImportedPageMetadata = {
      title: extracted.title ?? inheritedMeta.title,
      tags: extracted.tags.length ? extracted.tags : inheritedMeta.tags,
      description: extracted.description ?? inheritedMeta.description,
      creator: extracted.creator ?? inheritedMeta.creator,
      previewImageUrl: extracted.previewImageUrl ?? inheritedMeta.previewImageUrl,
    };
    if (pageHost.endsWith("makerworld.com")) {
      if (!makerworldCookie) makerworldCookie = resolveMakerworldCookie(body);
      downloadUrl = await resolveMakerworldDownloadUrl(html, finalUrl, makerworldCookie);
    }
    if (!downloadUrl && isThingiversePageHost(pageHost)) {
      if (thingiverseCookie === null) thingiverseCookie = resolveThingiverseCookie(body);
      downloadUrl = await resolveThingiverseDownloadUrl(finalUrl, thingiverseCookie);
    }
    if (!downloadUrl && isPrintablesPageHost(pageHost)) {
      downloadUrl = await resolvePrintablesDownloadUrl(finalUrl);
    }
    if (!downloadUrl) {
      downloadUrl = findDownloadUrl(html, finalUrl);
    }
    if (!downloadUrl) {
      if (truncated) {
        throw new HttpError(
          400,
          "No downloadable model file found in the scanned portion of the page. Use a direct download link or increase IMPORT_HTML_MAX_KB.",
        );
      }
      throw new HttpError(400, "No downloadable model file found. Use a direct download link.");
    }
    return openImportResponse(downloadUrl, body, finalUrl, depth + 1, resolvedMeta);
  }

  return { response: res, finalUrl, meta: inheritedMeta };
}

async function streamToFileCapped(response: Response, destPath: string, maxBytes: number): Promise<number> {
  if (!response.body) {
    await fs.writeFile(destPath, Buffer.alloc(0));
    return 0;
  }
  const reader = response.body.getReader();
  const handle = await fs.open(destPath, "w");
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, "Imported file exceeds size limit");
      }
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  return total;
}

/** Downloads `url` to a temp file without creating a Print (used by inspect/zip-entries/zip-extract). */
export async function downloadImportToTemp(
  url: string,
  body: ImportRequestBody,
): Promise<{ tempPath: string; filename: string; mime: string; meta: ImportedPageMetadata }> {
  const { response, finalUrl, meta } = await openImportResponse(url, body);
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > IMPORT_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new HttpError(413, "Imported file exceeds size limit");
  }
  const filename = buildImportFilename(finalUrl, response.headers, body.filename);
  const mime = mimeFromContentType(response.headers.get("content-type"), filename);
  const suffix = path.extname(filename) || "";
  const tempPath = path.join(os.tmpdir(), `printstash-import-${crypto.randomBytes(8).toString("hex")}${suffix}`);
  try {
    await streamToFileCapped(response, tempPath, IMPORT_MAX_BYTES);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
  return { tempPath, filename, mime, meta };
}

/** Inspects a link without downloading the file body: returns the filename/mime/is_zip/title it
 * would resolve to. */
export async function inspectImportLink(
  url: string,
  body: ImportRequestBody,
): Promise<{ filename: string; mime: string; is_zip: boolean; title: string | null }> {
  const { response, finalUrl, meta } = await openImportResponse(url, body);
  await response.body?.cancel().catch(() => undefined);
  const filename = buildImportFilename(finalUrl, response.headers, body.filename);
  const mime = mimeFromContentType(response.headers.get("content-type"), filename);
  const isZip = path.extname(filename).toLowerCase() === ".zip";
  return { filename, mime, is_zip: isZip, title: meta.title };
}

const COVER_IMAGE_MAX_BYTES = 16 * 1024 * 1024;

/** Best-effort: downloads a resolved page's cover/preview image and uses it as the plate's
 * thumbnail, but only when nothing better (e.g. an embedded .3mf thumbnail extracted from the
 * file itself during createPrint) was already set. Never throws -- a broken cover image
 * shouldn't fail the import. */
export async function applyCoverThumbnailIfMissing(
  plateId: string | undefined,
  imageUrl: string | null | undefined,
): Promise<void> {
  if (!plateId || !imageUrl || plateThumbExists(plateId)) return;
  try {
    const res = await rawFetch(imageUrl, { "User-Agent": IMPORT_USER_AGENT, Accept: "image/*" });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return;
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > COVER_IMAGE_MAX_BYTES) {
      await res.body?.cancel().catch(() => undefined);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > COVER_IMAGE_MAX_BYTES) return;
    await saveThumbFromBytes(plateId, buf);
  } catch {
    // best-effort only
  }
}

/** Downloads a URL and creates a single-plate Print from it (POST /import). */
export async function importPrintFromUrl(
  url: string,
  body: ImportRequestBody,
): Promise<{ print: Print; plates: Plate[] }> {
  const { tempPath, filename, mime, meta } = await downloadImportToTemp(url, body);
  const printMeta: PrintMetaInput = {
    title: body.title ?? meta.title ?? null,
    notes: body.notes ?? meta.description ?? null,
    tags: body.tags && body.tags.length ? body.tags : meta.tags,
    folderId: body.folder_id ?? null,
    creator: meta.creator ?? null,
  };
  try {
    const result = await createPrint(printMeta, path.parse(filename).name, [{ filename, mime, tempFilePath: tempPath }]);
    await applyCoverThumbnailIfMissing(result.plates[0]?.id, meta.previewImageUrl);
    return result;
  } finally {
    if (fsSync.existsSync(tempPath)) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

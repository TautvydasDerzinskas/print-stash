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
  parseThingiverseThingUrl,
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
import {
  extractMakerworldBearerToken,
  MakerworldAuthError,
  MakerworldCaptchaError,
  parseMakerworldModelUrl,
  resolveMakerworldViaCloudApi,
} from "./makerworldCloudApi";
import { upsertAuthorFromImport } from "./authorService";
import { createPrint, type PrintMetaInput } from "./printCreation";
import { plateThumbExists, saveThumbFromBytes } from "./printService";
import { addPreviewImage } from "./previewImageService";
import { prisma } from "../db";
import { Prisma } from "@prisma/client";
import type { Author, Plate, PreviewImage, Print } from "@prisma/client";

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

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

type MakerworldCloudShortcut = { downloadUrl: string; meta: ImportedPageMetadata };

/** Attempts the api.bambulab.com resolution path for a MakerWorld model URL. Returns null
 * for anything that should fall back to the existing page-scraping resolver (not a model
 * URL, no usable token, or an unexpected upstream shape); rethrows the two failures worth
 * telling the user about directly (expired session, CAPTCHA challenge) as HttpErrors instead
 * of silently falling through to a resolver that would just fail the same way again. */
async function tryMakerworldCloudApi(url: string, body: ImportRequestBody): Promise<MakerworldCloudShortcut | null> {
  const parsed = parseMakerworldModelUrl(url);
  if (!parsed) return null;
  const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));
  if (!bearerToken) return null;

  try {
    const resolved = await resolveMakerworldViaCloudApi(parsed.designId, parsed.requestedInstanceId, bearerToken);
    return resolved;
  } catch (err) {
    if (err instanceof MakerworldCaptchaError) throw new HttpError(429, err.message);
    if (err instanceof MakerworldAuthError) throw new HttpError(401, err.message);
    throw err;
  }
}

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

  let host = "";
  try {
    host = (new URL(validatedUrl).hostname || "").toLowerCase();
  } catch {
    host = "";
  }

  // MakerWorld model pages: try resolving straight through api.bambulab.com first (no
  // Cloudflare, no cookie-gated web session, no HTML scraping -- see makerworldCloudApi.ts).
  // Only at the top of the chain, so a URL this already resolved down to (e.g. the signed S3
  // download link) doesn't get reinterpreted as a fresh model page on the recursive call.
  if (depth === 0 && host.endsWith("makerworld.com")) {
    const cloudResolved = await tryMakerworldCloudApi(validatedUrl, body);
    if (cloudResolved) {
      return openImportResponse(cloudResolved.downloadUrl, body, validatedUrl, depth + 1, cloudResolved.meta);
    }
  }

  const headers: Record<string, string> = { "User-Agent": IMPORT_USER_AGENT, Accept: "*/*" };
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
      filename: extracted.filename ?? inheritedMeta.filename,
      galleryImages: extracted.galleryImages.length ? extracted.galleryImages : inheritedMeta.galleryImages,
      author: extracted.author ?? inheritedMeta.author,
      siteCategoryIds: extracted.siteCategoryIds.length ? extracted.siteCategoryIds : inheritedMeta.siteCategoryIds,
      categorySite: extracted.categorySite ?? inheritedMeta.categorySite,
    };
    if (pageHost.endsWith("makerworld.com")) {
      if (!makerworldCookie) makerworldCookie = resolveMakerworldCookie(body);
      downloadUrl = await resolveMakerworldDownloadUrl(html, finalUrl, makerworldCookie);
    }
    if (!downloadUrl && isThingiversePageHost(pageHost)) {
      if (thingiverseCookie === null) thingiverseCookie = resolveThingiverseCookie(body);
      const resolved = await resolveThingiverseDownloadUrl(finalUrl, thingiverseCookie);
      if (resolved) {
        downloadUrl = resolved.downloadUrl;
        // Thingiverse has no server-rendered per-Thing page (confirmed live -- it's a client
        // SPA shell), so extractPageMetadata's HTML pass above never finds anything for it;
        // this is the only source of title/creator/author/preview for a Thingiverse import.
        if (resolved.meta.title) resolvedMeta.title = resolved.meta.title;
        if (resolved.meta.creator) resolvedMeta.creator = resolved.meta.creator;
        if (resolved.meta.author) resolvedMeta.author = resolved.meta.author;
        if (resolved.meta.previewImageUrl) resolvedMeta.previewImageUrl = resolved.meta.previewImageUrl;
      }
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
  const filename = buildImportFilename(finalUrl, response.headers, body.filename ?? meta.filename);
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
  const filename = buildImportFilename(finalUrl, response.headers, body.filename ?? meta.filename);
  const mime = mimeFromContentType(response.headers.get("content-type"), filename);
  const isZip = path.extname(filename).toLowerCase() === ".zip";
  return { filename, mime, is_zip: isZip, title: meta.title };
}

const PREVIEW_IMAGE_MAX_BYTES = 16 * 1024 * 1024;
const PREVIEW_IMAGE_MAX_COUNT = 20;

async function fetchImageBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await rawFetch(url, { "User-Agent": IMPORT_USER_AGENT, Accept: "image/*" });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > PREVIEW_IMAGE_MAX_BYTES) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > PREVIEW_IMAGE_MAX_BYTES ? null : buf;
  } catch {
    return null;
  }
}

/** Best-effort: downloads a resolved page's cover photo and remaining gallery photos and stores
 * them as the print's preview images -- the cover first, so it lands at position 0 (the detail
 * page's default/main image) -- and seeds the plate's own thumbnail from the same cover bytes
 * when nothing better (e.g. an embedded .3mf thumbnail extracted during createPrint) already set
 * one. Every image is independent and this never throws: a broken photo shouldn't fail the
 * import, it just means one fewer preview image (the generated-snapshot fallback in
 * POST /plate/:id/thumbnail-generated covers a print that ends up with none at all). */
export async function attachImportedPreviewImages(
  printId: string | undefined,
  plateId: string | undefined,
  coverImageUrl: string | null | undefined,
  galleryImages: { url: string; filename: string }[],
): Promise<void> {
  if (!printId) return;
  const seen = new Set<string>();
  const orderedUrls: string[] = [];
  if (coverImageUrl) {
    orderedUrls.push(coverImageUrl);
    seen.add(coverImageUrl);
  }
  for (const image of galleryImages) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    orderedUrls.push(image.url);
  }

  let platesThumbSeeded = false;
  for (const url of orderedUrls.slice(0, PREVIEW_IMAGE_MAX_COUNT)) {
    const buf = await fetchImageBytes(url);
    if (!buf) continue;
    await addPreviewImage(printId, buf);
    if (!platesThumbSeeded && plateId && !plateThumbExists(plateId)) {
      await saveThumbFromBytes(plateId, buf);
      platesThumbSeeded = true;
    }
  }
}

const CATEGORY_SITE_FOLDER_FIELD = {
  makerworld: "makerworldCatId",
  thingiverse: "thingiverseCatId",
  printables: "printablesCatId",
} as const;

/** When the caller didn't pick a folder explicitly, checks whether any of the user's folders
 * declared a `*CatId` for this source site matching one of the model's own category ids -- if
 * so, the import auto-lands there instead of staying uncategorized. Site-scoped (each site's
 * category ids are an independent namespace) and best-effort: a lookup failure just leaves the
 * print uncategorized rather than failing the import. */
async function resolveFolderIdByCategory(
  userId: string,
  categorySite: ImportedPageMetadata["categorySite"],
  siteCategoryIds: number[],
): Promise<string | null> {
  if (!categorySite || !siteCategoryIds.length) return null;
  const field = CATEGORY_SITE_FOLDER_FIELD[categorySite];
  const folder = await prisma.folder.findFirst({
    where: { userId, [field]: { in: siteCategoryIds } },
    orderBy: { position: "asc" },
  });
  return folder?.id ?? null;
}

/** Identifies a provider + stable external id for a model URL, when possible -- used to dedup
 * imports (see importPrintFromUrl below) so re-importing the same design, whether pasted again
 * directly or pulled in as part of a different collection's batch import, reuses the existing
 * Print instead of re-downloading a duplicate. MakerWorld only for now; a URL that doesn't match
 * any known provider (or isn't from one at all -- a generic file host, say) returns null and is
 * simply never deduped, same as today. */
export function identifySourceModel(url: string): { provider: string; externalId: string } | null {
  const makerworld = parseMakerworldModelUrl(url);
  if (makerworld) return { provider: "makerworld", externalId: makerworld.designId };
  const thingiverse = parseThingiverseThingUrl(url);
  if (thingiverse) return { provider: "thingiverse", externalId: thingiverse.thingId };
  return null;
}

async function findExistingImportedPrint(
  userId: string,
  source: { provider: string; externalId: string },
): Promise<{ print: Print; plates: Plate[]; author: Author | null; previewImages: PreviewImage[] } | null> {
  const print = await prisma.print.findFirst({
    where: { userId, sourceProvider: source.provider, sourceExternalId: source.externalId },
    include: { author: true },
  });
  if (!print) return null;
  const [plates, previewImages] = await Promise.all([
    prisma.plate.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } }),
    prisma.previewImage.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } }),
  ]);
  return { print, plates, author: print.author, previewImages };
}

/** Downloads a URL and creates a single-plate Print from it (POST /import). Returns
 * `alreadyImported: true` (and the existing print, left untouched) instead of re-downloading
 * when this exact source model has already been imported by this user. */
export async function importPrintFromUrl(
  userId: string,
  url: string,
  body: ImportRequestBody,
): Promise<{ print: Print; plates: Plate[]; author: Author | null; previewImages: PreviewImage[]; alreadyImported: boolean }> {
  const source = identifySourceModel(url);
  if (source) {
    const existing = await findExistingImportedPrint(userId, source);
    if (existing) return { ...existing, alreadyImported: true };
  }

  const { tempPath, filename, mime, meta } = await downloadImportToTemp(url, body);
  const author = await upsertAuthorFromImport(meta.author);
  const folderId =
    body.folder_id ?? (await resolveFolderIdByCategory(userId, meta.categorySite, meta.siteCategoryIds));
  const printMeta: PrintMetaInput = {
    title: body.title ?? meta.title ?? null,
    notes: body.notes ?? meta.description ?? null,
    tags: body.tags && body.tags.length ? body.tags : meta.tags,
    folderId,
    creator: meta.creator ?? null,
    authorId: author?.id ?? null,
    sourceProvider: source?.provider ?? null,
    sourceExternalId: source?.externalId ?? null,
  };
  try {
    let result: { print: Print; plates: Plate[] };
    try {
      result = await createPrint(userId, printMeta, path.parse(filename).name, [
        { filename, mime, tempFilePath: tempPath },
      ]);
    } catch (err) {
      // Race guard: another concurrent import of the same source model won between our
      // dedup check above and this create -- treat it the same as finding it up front.
      if (source && isUniqueConstraintError(err)) {
        const existing = await findExistingImportedPrint(userId, source);
        if (existing) return { ...existing, alreadyImported: true };
      }
      throw err;
    }
    await attachImportedPreviewImages(result.print.id, result.plates[0]?.id, meta.previewImageUrl, meta.galleryImages);
    const previewImages = await prisma.previewImage.findMany({
      where: { printId: result.print.id },
      orderBy: { position: "asc" },
    });
    return { ...result, author, previewImages, alreadyImported: false };
  } finally {
    if (fsSync.existsSync(tempPath)) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

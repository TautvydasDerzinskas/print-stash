import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  IMPORT_ALLOWED_EXTS,
  IMPORT_HTML_MAX_BYTES,
  IMPORT_MAX_BYTES,
  IMPORT_PREVIEW_IMAGE_DELAY_MS,
  IMPORT_TIMEOUT_SECONDS,
  IMPORT_USER_AGENT,
} from "../config";
import { HttpError, buildImportFilename, guessMimeFromPath, isHtmlContentType, mimeFromContentType, sanitizeFilename } from "../utils/fileUtils";
import { validateRemoteUrl } from "../utils/urlUtils";
import { maybeSleep, sleep } from "../utils/concurrency";
import { fetchViaFlaresolverr, isFlaresolverrEnabled, looksLikeCloudflareBlock, shouldProxyHost } from "./flaresolverr";
import {
  emptyImportedPageMetadata,
  extractPageMetadata,
  findDownloadUrl,
  isPrintablesPageHost,
  makerworldHtmlHeaders,
  printablesHtmlHeaders,
  resolveMakerworldCookie,
  resolveMakerworldDownloadUrl,
  resolvePrintablesDownloadUrl,
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
import {
  parseThingiverseThingUrl,
  resolveThingiverseThing,
  ThingiverseAuthError,
  ThingiverseRateLimitError,
  type ThingiversePlateFile,
} from "./thingiverseApi";
import { getThingiverseAccessToken } from "./settingsService";
import { upsertAuthorFromImport } from "./authorService";
import { createPrint, type NewPlateInput, type PrintMetaInput } from "./printCreation";
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
  /** Internal only -- never comes from the request body/schema. Set by runCollectionImportJob
   *  on each per-design body it builds for a MakerWorld collection batch import, and read
   *  wherever a MakerWorld-bound call happens along this whole chain (tryMakerworldCloudApi,
   *  openImportResponse's final fetch, attachImportedPreviewImages) so every single outbound
   *  call in the sequence -- not just the gap between models -- gets the same pacing. Unset
   *  (no extra delay) for a single-model import. */
  makerworldPaceMs?: number;
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
    const resolved = await resolveMakerworldViaCloudApi(parsed.designId, parsed.requestedInstanceId, bearerToken, body.makerworldPaceMs);
    return resolved;
  } catch (err) {
    if (err instanceof MakerworldCaptchaError) throw new HttpError(429, err.message);
    // 400, not 401: this is MakerWorld's own session rejecting our request, not the caller's
    // PrintStash session -- the frontend's generic API client treats any 401 as "your
    // PrintStash session expired" and force-logs-out, which would be exactly wrong here.
    if (err instanceof MakerworldAuthError) throw new HttpError(400, err.message);
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
  if (host.endsWith("makerworld.com")) {
    makerworldCookie = resolveMakerworldCookie(body);
    Object.assign(headers, makerworldHtmlHeaders(referer || validatedUrl, makerworldCookie));
  } else if (isPrintablesPageHost(host)) {
    Object.assign(headers, printablesHtmlHeaders(referer || validatedUrl));
  }
  if (referer) headers.Referer = referer;

  // Paces the actual file/page fetch too -- for a MakerWorld collection batch (the only source
  // of makerworldPaceMs), this is what follows the design+profile+author calls already paced
  // inside resolveMakerworldViaCloudApi, keeping the whole per-model sequence evenly spaced
  // rather than pacing everything except the final (often largest) request.
  await maybeSleep(body.makerworldPaceMs);
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
  paceMs?: number,
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
  const urls = orderedUrls.slice(0, PREVIEW_IMAGE_MAX_COUNT);
  const delayMs = paceMs ?? IMPORT_PREVIEW_IMAGE_DELAY_MS;
  for (let i = 0; i < urls.length; i++) {
    await sleep(delayMs);
    const buf = await fetchImageBytes(urls[i]);
    if (buf) {
      await addPreviewImage(printId, buf);
      if (!platesThumbSeeded && plateId && !plateThumbExists(plateId)) {
        await saveThumbFromBytes(plateId, buf);
        platesThumbSeeded = true;
      }
    }
  }
}

const CATEGORY_SITE_FOLDER_FIELD = {
  makerworld: "makerworldCatIds",
  thingiverse: "thingiverseCatIds",
  printables: "printablesCatIds",
} as const;

/** When the caller didn't pick a folder explicitly, checks whether any of the user's folders
 * declared a `*CatIds` list for this source site overlapping the model's own category ids -- if
 * so, the import auto-lands there instead of staying uncategorized. A folder can list several
 * ids per site (e.g. a parent category plus a couple of its subcategories -- see
 * routes/folders.ts's parseCatIdsInput), so this is a set-overlap ("hasSome") check, not an
 * equality one. Site-scoped (each site's category ids are an independent namespace) and
 * best-effort: a lookup failure just leaves the print uncategorized rather than failing the
 * import. */
async function resolveFolderIdByCategory(
  userId: string,
  categorySite: ImportedPageMetadata["categorySite"],
  siteCategoryIds: number[],
): Promise<string | null> {
  if (!categorySite || !siteCategoryIds.length) return null;
  const field = CATEGORY_SITE_FOLDER_FIELD[categorySite];
  const folder = await prisma.folder.findFirst({
    where: { userId, [field]: { hasSome: siteCategoryIds } },
    orderBy: { position: "asc" },
  });
  return folder?.id ?? null;
}

/** Identifies a provider + stable external id for a model URL, when possible -- used to dedup
 * imports (see importPrintFromUrl below) so re-importing the same design, whether pasted again
 * directly or pulled in as part of a different collection's batch import, reuses the existing
 * Print instead of re-downloading a duplicate. A URL that doesn't match any known provider (or
 * isn't from one at all -- a generic file host, say) returns null and is simply never deduped. */
export function identifySourceModel(url: string): { provider: string; externalId: string } | null {
  const makerworld = parseMakerworldModelUrl(url);
  if (makerworld) return { provider: "makerworld", externalId: makerworld.designId };
  const thingiverse = parseThingiverseThingUrl(url);
  if (thingiverse) return { provider: "thingiverse", externalId: thingiverse.thingId };
  return null;
}

/** The inverse of identifySourceModel above -- rebuilds the original model page URL from the
 * stable provider + external id a Print was imported with (Print.sourceProvider/
 * sourceExternalId), for the "Open in {Provider}" link on the model card/detail menus. No raw
 * URL is stored anywhere; both provider URL shapes are simple and stable enough to reconstruct
 * (mirrors the exact same string-building already done at import time in importJobRunner.ts). */
export function buildImportSourceUrl(provider: string | null, externalId: string | null): string | null {
  if (!provider || !externalId) return null;
  if (provider === "makerworld") return `https://makerworld.com/en/models/${externalId}`;
  if (provider === "thingiverse") return `https://www.thingiverse.com/thing:${externalId}`;
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

/** Bulk version of findExistingImportedPrint's lookup -- used by the collection/likes ".../entries"
 * routes to flag which entries in a listing the user already has, *before* they pick what to
 * import, instead of only finding out one by one as each import attempt hits the unique
 * constraint. Returns just the set of already-imported external ids (one indexed query), not
 * full Print records -- the entries list only needs a yes/no per item. */
export async function findImportedExternalIds(userId: string, provider: string, externalIds: string[]): Promise<Set<string>> {
  if (!externalIds.length) return new Set();
  const prints = await prisma.print.findMany({
    where: { userId, sourceProvider: provider, sourceExternalId: { in: externalIds } },
    select: { sourceExternalId: true },
  });
  return new Set(prints.map((p) => p.sourceExternalId).filter((id): id is string => id !== null));
}

const THINGIVERSE_PLATE_EXTS = new Set([...IMPORT_ALLOWED_EXTS].filter((ext) => ext !== ".zip"));

type PlainDownloadResult = { input: NewPlateInput } | { rateLimited: true } | null;

/** Downloads one plain, unauthenticated file URL (a Thingiverse CDN asset -- see
 * thingiverseApi.ts's zip_data.files) to a temp file. Best-effort: returns null instead of
 * throwing, so one unreachable file among several doesn't fail the whole Thing import -- except
 * a 429 (Cloudflare rate-limit challenge, same as api.thingiverse.com can return -- see
 * ThingiverseRateLimitError), which is reported back distinctly since the caller needs to know
 * *why* every file failed to report that honestly instead of a generic "couldn't be downloaded". */
async function downloadPlainFileToTemp(url: string, suggestedName: string): Promise<PlainDownloadResult> {
  try {
    const res = await rawFetch(url, { "User-Agent": IMPORT_USER_AGENT, Accept: "*/*" });
    if (res.status === 429) {
      await res.body?.cancel().catch(() => undefined);
      return { rateLimited: true };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const filename = sanitizeFilename(suggestedName);
    const tempFilePath = path.join(
      os.tmpdir(),
      `printstash-thingiverse-${crypto.randomBytes(8).toString("hex")}${path.extname(filename)}`,
    );
    await streamToFileCapped(res, tempFilePath, IMPORT_MAX_BYTES);
    return { input: { filename, mime: guessMimeFromPath(filename), tempFilePath } };
  } catch {
    return null;
  }
}

/** Thingiverse import path: entirely separate from openImportResponse's generic HTML-scraping
 * flow (see thingiverseApi.ts for why -- www.thingiverse.com is Cloudflare-gated, the official
 * api.thingiverse.com resolves everything needed directly). Every recognized model file bundled
 * with the Thing becomes its own Plate on one Print -- mirrors both a multi-file upload of one
 * model and how a single MakerWorld model (a multi-plate .3mf) already becomes one Print with
 * several plates. */
async function importThingiverseThing(
  userId: string,
  source: { provider: string; externalId: string },
  body: ImportRequestBody,
): Promise<{ print: Print; plates: Plate[]; author: Author | null; previewImages: PreviewImage[]; alreadyImported: boolean }> {
  const accessToken = await getThingiverseAccessToken();
  if (!accessToken) {
    throw new HttpError(
      503,
      "Thingiverse import isn't configured for this instance yet -- ask an admin to add an Access Token in Admin Settings.",
    );
  }

  let resolved;
  try {
    resolved = await resolveThingiverseThing(source.externalId, accessToken);
  } catch (err) {
    if (err instanceof ThingiverseRateLimitError) throw new HttpError(429, err.message);
    // 400, not 401: this is the server's configured Thingiverse Access Token being rejected, not
    // the caller's PrintStash session -- see the identical reasoning at tryMakerworldCloudApi
    // above for why 401 specifically would mislead the frontend into logging the user out.
    if (err instanceof ThingiverseAuthError) throw new HttpError(400, err.message);
    throw err;
  }
  if (!resolved) {
    throw new HttpError(404, "This Thingiverse Thing could not be found, or isn't accessible with the configured Access Token.");
  }
  const { meta, plateFiles, galleryImages } = resolved;

  const author = await upsertAuthorFromImport(meta.author ?? null);
  const folderId =
    body.folder_id ?? (await resolveFolderIdByCategory(userId, meta.categorySite ?? null, meta.siteCategoryIds ?? []));
  const printMeta: PrintMetaInput = {
    title: body.title ?? meta.title ?? null,
    notes: body.notes ?? meta.description ?? null,
    tags: body.tags && body.tags.length ? body.tags : (meta.tags ?? []),
    folderId,
    creator: meta.creator ?? null,
    authorId: author?.id ?? null,
    sourceProvider: source.provider,
    sourceExternalId: source.externalId,
  };

  const modelFiles = plateFiles.filter((f: ThingiversePlateFile) => THINGIVERSE_PLATE_EXTS.has(path.extname(f.name).toLowerCase()));
  const downloadResults = await Promise.all(modelFiles.map((f: ThingiversePlateFile) => downloadPlainFileToTemp(f.url, f.name)));
  const downloaded = downloadResults
    .filter((result): result is { input: NewPlateInput } => result !== null && "input" in result)
    .map((result) => result.input);
  if (!downloaded.length) {
    const wasRateLimited = downloadResults.some((result) => result !== null && "rateLimited" in result);
    if (wasRateLimited) {
      throw new HttpError(
        429,
        "Thingiverse blocked a file download with a rate-limit challenge (Cloudflare). This usually clears after a while -- wait, then retry the same import.",
      );
    }
    throw new HttpError(400, "None of this Thing's files could be downloaded.");
  }

  try {
    let result: { print: Print; plates: Plate[] };
    try {
      result = await createPrint(userId, printMeta, meta.title || `thing-${source.externalId}`, downloaded);
    } catch (err) {
      // Race guard: another concurrent import of the same source model won between our
      // dedup check above and this create -- treat it the same as finding it up front.
      if (isUniqueConstraintError(err)) {
        const existing = await findExistingImportedPrint(userId, source);
        if (existing) return { ...existing, alreadyImported: true };
      }
      throw err;
    }
    const gallery = galleryImages.map((img) => ({ url: img.url, filename: img.name }));
    await attachImportedPreviewImages(result.print.id, result.plates[0]?.id, meta.previewImageUrl ?? null, gallery);
    const previewImages = await prisma.previewImage.findMany({
      where: { printId: result.print.id },
      orderBy: { position: "asc" },
    });
    return { ...result, author, previewImages, alreadyImported: false };
  } finally {
    for (const input of downloaded) {
      if (input.tempFilePath && fsSync.existsSync(input.tempFilePath)) {
        await fs.rm(input.tempFilePath, { force: true }).catch(() => undefined);
      }
    }
  }
}

/** Downloads a URL and creates a Print from it (POST /import) -- one plate for most sources, or
 * several when the source is a Thingiverse Thing (see importThingiverseThing). Returns
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

  if (source?.provider === "thingiverse") {
    return importThingiverseThing(userId, source, body);
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
    await attachImportedPreviewImages(
      result.print.id,
      result.plates[0]?.id,
      meta.previewImageUrl,
      meta.galleryImages,
      body.makerworldPaceMs,
    );
    const previewImages = await prisma.previewImage.findMany({
      where: { printId: result.print.id },
      orderBy: { position: "asc" },
    });
    return { ...result, author, previewImages, alreadyImported: false };
  } finally {
    if (fsSync.existsSync(tempPath)) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

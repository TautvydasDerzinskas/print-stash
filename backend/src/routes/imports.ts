import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { normalizeImportUrl } from "../utils/urlUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { downloadImportToTemp, importPrintFromUrl, inspectImportLink, type ImportRequestBody } from "../services/importService";
import { resolveMakerworldCookie } from "../services/importResolvers";
import { upsertAuthorFromImport } from "../services/authorService";
import { extractMakerworldBearerToken } from "../services/makerworldCloudApi";
import {
  fetchMakerworldCollectionEntries,
  fetchMakerworldCollectionTitle,
  parseMakerworldCollectionUrl,
} from "../services/makerworldCollections";
import { addPrintsToCollection, findOrCreateCollectionByName } from "../services/collectionService";
import { extractZipEntriesToPrints, listZipEntries } from "../services/zipService";
import { toPrintOut, type PrintOut } from "../dto";

const router = Router();
router.use(requireAuth);

const importRequestSchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  folder_id: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  makerworld_cookie: z.string().nullable().optional(),
  thingiverse_cookie: z.string().nullable().optional(),
});

router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const body = parseBody(importRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const { print, plates, author, previewImages } = await importPrintFromUrl(req.userId!, url, body);
    res.json(toPrintOut(print, plates, [], null, author, previewImages));
  }),
);

router.post(
  "/import/inspect",
  asyncHandler(async (req, res) => {
    const body = parseBody(importRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const result = await inspectImportLink(url, body);
    res.json(result);
  }),
);

router.post(
  "/import/zip/entries",
  asyncHandler(async (req, res) => {
    const body = parseBody(importRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const { tempPath, filename } = await downloadImportToTemp(url, body);
    try {
      if (path.extname(filename).toLowerCase() !== ".zip") throw new HttpError(415, "Imported file is not a zip");
      const entries = await listZipEntries(tempPath);
      if (!entries.length) throw new HttpError(400, "No files found in zip");
      res.json({ filename, entries });
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }),
);

const zipExtractRequestSchema = importRequestSchema.extend({ entries: z.array(z.string()) });
router.post(
  "/import/zip",
  asyncHandler(async (req, res) => {
    const body = parseBody(zipExtractRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const { tempPath, filename, meta } = await downloadImportToTemp(url, body);
    try {
      if (path.extname(filename).toLowerCase() !== ".zip") throw new HttpError(415, "Imported file is not a zip");
      const author = await upsertAuthorFromImport(meta.author);
      const { prints, failed } = await extractZipEntriesToPrints(req.userId!, tempPath, body.entries, {
        title: body.title ?? meta.title,
        notes: body.notes ?? meta.description,
        tags: body.tags && body.tags.length ? body.tags : meta.tags,
        folderId: body.folder_id,
        creator: meta.creator,
        authorId: author?.id ?? null,
        previewImageUrl: meta.previewImageUrl,
        galleryImages: meta.galleryImages,
      });
      res.json({ prints: prints.map((p) => toPrintOut(p, p.plates, [], null, author, p.previewImages)), failed });
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }),
);

router.post(
  "/import/collection/entries",
  asyncHandler(async (req, res) => {
    const body = parseBody(importRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const parsed = parseMakerworldCollectionUrl(url);
    if (!parsed) throw new HttpError(400, "Not a MakerWorld collection URL");
    const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));

    const [title, listing] = await Promise.all([
      fetchMakerworldCollectionTitle(parsed.collectionId, bearerToken),
      fetchMakerworldCollectionEntries(parsed.collectionId, bearerToken),
    ]);
    if (!listing.entries.length) throw new HttpError(400, "Could not load this collection's models");

    res.json({
      title,
      total: listing.total,
      truncated: listing.truncated,
      entries: listing.entries.map((e) => ({ design_id: e.designId, title: e.title, cover: e.cover })),
    });
  }),
);

/** Runs `worker` over `items` with at most `limit` in flight at once, preserving item order
 * in the returned results. Used to import a batch of MakerWorld designs without either running
 * hundreds of downloads fully sequentially (slow) or firing them all at once (hammers the
 * upstream API right after we specifically built cool-off handling to avoid that). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

const COLLECTION_IMPORT_CONCURRENCY = 3;
const collectionImportRequestSchema = importRequestSchema.extend({ design_ids: z.array(z.string()).min(1) });

router.post(
  "/import/collection",
  asyncHandler(async (req, res) => {
    const body = parseBody(collectionImportRequestSchema, req.body);

    const results = await mapWithConcurrency(body.design_ids, COLLECTION_IMPORT_CONCURRENCY, async (designId) => {
      const modelUrl = `https://makerworld.com/en/models/${designId}`;
      const itemBody: ImportRequestBody = {
        url: modelUrl,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        folder_id: body.folder_id ?? null,
        makerworld_cookie: body.makerworld_cookie,
        thingiverse_cookie: body.thingiverse_cookie,
      };
      try {
        const { print, plates, author, previewImages } = await importPrintFromUrl(req.userId!, modelUrl, itemBody);
        return { ok: true as const, print: toPrintOut(print, plates, [], null, author, previewImages) };
      } catch {
        return { ok: false as const, designId };
      }
    });

    const prints: PrintOut[] = [];
    const failed: string[] = [];
    for (const result of results) {
      if (result.ok) prints.push(result.print);
      else failed.push(result.designId);
    }

    // Re-derive the source MakerWorld collection's title from the same URL the client sent to
    // /import/collection/entries, and file every successfully imported print under a Collection
    // of that name -- reusing (rather than duplicating) it if one already exists for this user.
    if (prints.length) {
      const url = await normalizeImportUrl(body.url);
      const parsed = parseMakerworldCollectionUrl(url);
      if (parsed) {
        const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));
        const title = await fetchMakerworldCollectionTitle(parsed.collectionId, bearerToken);
        if (title) {
          const collection = await findOrCreateCollectionByName(req.userId!, title);
          await addPrintsToCollection(collection.id, prints.map((p) => p.id));
        }
      }
    }

    res.json({ prints, failed });
  }),
);

export default router;

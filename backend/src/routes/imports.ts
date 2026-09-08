import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { normalizeImportUrl } from "../utils/urlUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { downloadImportToTemp, importPrintFromUrl, inspectImportLink } from "../services/importService";
import { resolveMakerworldCookie } from "../services/importResolvers";
import { extractMakerworldBearerToken } from "../services/makerworldCloudApi";
import { fetchMakerworldCollectionEntries, fetchMakerworldCollectionTitle, parseMakerworldCollectionUrl } from "../services/makerworldCollections";
import { listZipEntries } from "../services/zipService";
import { createJob, getActiveJob, getJob } from "../services/importJobService";
import { runCollectionImportJob, runZipImportJob } from "../services/importJobRunner";
import { toImportJobOut, toPrintOut } from "../dto";

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

// ---- Background batch imports (MakerWorld collection / remote zip) ---------------------------
//
// Both of these can involve downloading dozens to hundreds of files, which used to happen
// synchronously inside the request -- long enough to run past reverse-proxy read timeouts with
// no feedback. They now just register an ImportJob and return immediately; the actual work runs
// in the background (importJobRunner.ts) and is polled via GET /import/jobs/:id. At most one
// job may be RUNNING per user at a time -- that's both the "already in progress" guard and what
// lets the frontend restore its progress bar after a page refresh via GET /import/jobs/active.

async function assertNoActiveJob(userId: string): Promise<void> {
  const active = await getActiveJob(userId);
  if (active) throw new HttpError(409, "An import is already in progress");
}

const collectionImportRequestSchema = importRequestSchema.extend({ design_ids: z.array(z.string()).min(1) });

router.post(
  "/import/collection",
  asyncHandler(async (req, res) => {
    const body = parseBody(collectionImportRequestSchema, req.body);
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    const job = await createJob(req.userId!, "COLLECTION", {
      sourceUrl: url,
      provider: "makerworld",
      total: body.design_ids.length,
    });
    void runCollectionImportJob(job.id, req.userId!, { ...body, url });
    res.status(202).json({ job_id: job.id });
  }),
);

const zipExtractRequestSchema = importRequestSchema.extend({ entries: z.array(z.string()) });

router.post(
  "/import/zip",
  asyncHandler(async (req, res) => {
    const body = parseBody(zipExtractRequestSchema, req.body);
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    const job = await createJob(req.userId!, "ZIP", {
      sourceUrl: url,
      total: body.entries.length,
    });
    void runZipImportJob(job.id, req.userId!, { ...body, url });
    res.status(202).json({ job_id: job.id });
  }),
);

router.get(
  "/import/jobs/active",
  asyncHandler(async (req, res) => {
    const job = await getActiveJob(req.userId!);
    res.json(job ? toImportJobOut(job) : null);
  }),
);

router.get(
  "/import/jobs/:id",
  asyncHandler(async (req, res) => {
    const job = await getJob(req.params.id, req.userId!);
    if (!job) throw new HttpError(404, "Import job not found");
    res.json(toImportJobOut(job));
  }),
);

export default router;

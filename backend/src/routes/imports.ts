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
import { extractZipEntriesToPrints, listZipEntries } from "../services/zipService";
import { toPrintOut } from "../dto";

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
    const { print, plates } = await importPrintFromUrl(url, body);
    res.json(toPrintOut(print, plates, [], null));
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
      const { prints, failed } = await extractZipEntriesToPrints(tempPath, body.entries, {
        title: body.title ?? meta.title,
        notes: body.notes ?? meta.description,
        tags: body.tags && body.tags.length ? body.tags : meta.tags,
        folderId: body.folder_id,
        creator: meta.creator,
        previewImageUrl: meta.previewImageUrl,
      });
      res.json({ prints: prints.map((p) => toPrintOut(p, p.plates, [], null)), failed });
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }),
);

export default router;

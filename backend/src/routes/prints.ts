import fs from "node:fs";
import path from "node:path";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError, sanitizeFilename, mimeFromContentType } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { modelUpload } from "../uploadMiddleware";
import { createPrint, deletePlateFiles, resolvePlateFilePath, type NewPlateInput } from "../services/printCreation";
import { plateThumbPath, relocatePrint, uniqueModelName } from "../services/printService";
import { toPrintOut } from "../dto";
import { loadFullPrint, printOutById } from "../services/printLoader";
import { deleteAllPrintFiles } from "../services/printFileService";
import { sendPrintsZip } from "../services/downloadZip";
import type { Prisma } from "@prisma/client";

const router = Router();
router.use(requireAuth);

function buildPrintWhere(req: Request): Prisma.PrintWhereInput {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const tagsParam = typeof req.query.tags === "string" ? req.query.tags : "";
  const folderId = typeof req.query.folder_id === "string" ? req.query.folder_id : undefined;

  const where: Prisma.PrintWhereInput = {};
  if (folderId) where.folderId = folderId;
  const tagList = tagsParam
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tagList.length) where.tags = { hasEvery: tagList };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { creator: { contains: q, mode: "insensitive" } },
      { collection: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

// ---- POST /upload ---------------------------------------------------------------------------

router.post(
  "/upload",
  modelUpload.array("files"),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    const body = req.body as Record<string, string | undefined>;
    try {
      if (!files.length) throw new HttpError(400, "No files uploaded");
      const mode = body.mode === "multiplate" ? "multiplate" : "separate";
      if (files.length > 1 && body.mode !== "separate" && body.mode !== "multiplate") {
        throw new HttpError(400, "mode is required when uploading more than one file");
      }
      const tags = (body.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const meta = {
        title: body.title || null,
        notes: body.notes || null,
        tags,
        folderId: body.folder_id || null,
      };

      const printsOut = [];
      if (files.length === 1 || mode === "separate") {
        for (const file of files) {
          const safeName = sanitizeFilename(file.originalname);
          const mime = mimeFromContentType(file.mimetype, safeName);
          const { print, plates } = await createPrint(meta, path.parse(safeName).name, [
            { filename: safeName, mime, tempFilePath: file.path },
          ]);
          printsOut.push(toPrintOut(print, plates, [], null));
        }
      } else {
        const plateInputs: NewPlateInput[] = files.map((f) => {
          const safeName = sanitizeFilename(f.originalname);
          return { filename: safeName, mime: mimeFromContentType(f.mimetype, safeName), tempFilePath: f.path };
        });
        const nameHint = path.parse(plateInputs[0].filename).name;
        const { print, plates } = await createPrint(meta, nameHint, plateInputs);
        printsOut.push(toPrintOut(print, plates, [], null));
      }
      res.json({ prints: printsOut });
    } finally {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
      }
    }
  }),
);

// ---- GET /prints ------------------------------------------------------------------------------

router.get(
  "/prints",
  asyncHandler(async (req, res) => {
    const limitRaw = req.query.limit;
    const offsetRaw = req.query.offset;
    let limit: number | undefined;
    let offset: number | undefined;
    if (limitRaw !== undefined) {
      limit = Number(limitRaw);
      if (!Number.isFinite(limit) || limit < 1 || limit > 1000) throw new HttpError(400, "Invalid limit");
    }
    if (offsetRaw !== undefined) {
      offset = Number(offsetRaw);
      if (!Number.isFinite(offset) || offset < 0) throw new HttpError(400, "Invalid offset");
    }

    const where = buildPrintWhere(req);
    const prints = await prisma.print.findMany({ where, include: { plates: { orderBy: { position: "asc" } } } });
    const printIds = prints.map((p) => p.id);
    const files = printIds.length ? await prisma.printFile.findMany({ where: { printId: { in: printIds } } }) : [];
    const filesByPrint = new Map<string, typeof files>();
    for (const f of files) {
      const list = filesByPrint.get(f.printId) ?? [];
      list.push(f);
      filesByPrint.set(f.printId, list);
    }

    const sorted = prints.toSorted((a, b) => {
      const nameCmp = a.name.localeCompare(b.name);
      if (nameCmp !== 0) return nameCmp;
      const af = a.plates[0]?.filename ?? "";
      const bf = b.plates[0]?.filename ?? "";
      const fCmp = af.localeCompare(bf);
      if (fCmp !== 0) return fCmp;
      return a.id.localeCompare(b.id);
    });

    let paged = sorted;
    if (limit !== undefined) {
      const start = offset ?? 0;
      paged = sorted.slice(start, start + limit);
      const hasMore = sorted.length > start + paged.length;
      res.setHeader("X-Has-More", hasMore ? "true" : "false");
      res.setHeader("X-Next-Offset", String(start + paged.length));
    }

    const out = paged.map((p) => {
      const printFiles = filesByPrint.get(p.id) ?? [];
      const preparedFile = p.preparedFileId ? printFiles.find((f) => f.id === p.preparedFileId) ?? null : null;
      return toPrintOut(p, p.plates, printFiles, preparedFile);
    });
    res.json(out);
  }),
);

// ---- GET /tags ----------------------------------------------------------------------------

router.get(
  "/tags",
  asyncHandler(async (req, res) => {
    const where = buildPrintWhere(req);
    const rows = await prisma.print.findMany({ where, select: { tags: true } });
    const found = new Set<string>();
    for (const row of rows) {
      for (const tag of row.tags) {
        const cleaned = tag.trim();
        if (cleaned) found.add(cleaned);
      }
    }
    res.json([...found].toSorted((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  }),
);

// ---- POST /download/zip --------------------------------------------------------------------

const downloadSchema = z.object({
  print_ids: z.array(z.string()).optional(),
  tag: z.string().optional(),
  folder_id: z.string().optional(),
  filename: z.string().optional(),
});

router.post(
  "/download/zip",
  asyncHandler(async (req, res) => {
    const body = parseBody(downloadSchema, req.body);
    if (!(body.print_ids?.length || body.tag || body.folder_id)) {
      throw new HttpError(400, "Provide print_ids, tag, or folder_id to download.");
    }
    const where: Prisma.PrintWhereInput = {};
    if (body.print_ids?.length) where.id = { in: body.print_ids };
    if (body.folder_id) where.folderId = body.folder_id;
    let prints = await prisma.print.findMany({
      where,
      include: { plates: { orderBy: { position: "asc" } }, folder: true },
    });
    if (body.tag) {
      const tag = body.tag.trim();
      prints = prints.filter((p) => p.tags.includes(tag));
    }

    let downloadName = body.filename || "printstash.zip";
    if (body.tag) {
      const safeTag = body.tag.replace(/ /g, "_").slice(0, 50) || "tag";
      downloadName = `${safeTag}.zip`;
    }
    if (body.folder_id) {
      const folder = prints.find((p) => p.folder)?.folder;
      if (folder) {
        const safeName = folder.name.replace(/ /g, "_").slice(0, 50) || "folder";
        downloadName = `${safeName}.zip`;
      }
    }
    await sendPrintsZip(res, prints, downloadName);
  }),
);

// ---- Plate file streaming + print thumbnail -----------------------------------------------

router.get(
  "/print/:id/plate/:plateId/file/:filename",
  asyncHandler(async (req, res) => {
    const plate = await prisma.plate.findUnique({ where: { id: req.params.plateId } });
    if (!plate || plate.printId !== req.params.id) throw new HttpError(404, "Not found");
    const filePath = resolvePlateFilePath(plate);
    if (!filePath) throw new HttpError(404, "Not found");
    res.setHeader("Content-Type", plate.mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(plate.filename)}"`);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(path.resolve(filePath));
  }),
);

router.get(
  "/print/:id/thumb.jpg",
  asyncHandler(async (req, res) => {
    const plate0 = await prisma.plate.findFirst({ where: { printId: req.params.id }, orderBy: { position: "asc" } });
    if (!plate0) throw new HttpError(404, "Not found");
    const thumbPath = plateThumbPath(plate0.id);
    if (!fs.existsSync(thumbPath)) throw new HttpError(404, "Not found");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(path.resolve(thumbPath));
  }),
);

// ---- Print metadata mutation routes ---------------------------------------------------------

const tagsSchema = z.object({ tags: z.array(z.string()) });
router.post(
  "/print/:id/tags",
  asyncHandler(async (req, res) => {
    const body = parseBody(tagsSchema, req.body);
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print) throw new HttpError(404, "Print not found");
    const updated = await prisma.print.update({
      where: { id: print.id },
      data: { tags: body.tags.map((t) => t.trim()).filter(Boolean) },
    });
    const plates = await prisma.plate.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } });
    await relocatePrint(updated, plates);
    res.json({ print: await printOutById(print.id) });
  }),
);

const metaSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  creator: z.string().optional(),
  collection: z.string().optional(),
});
router.post(
  "/print/:id/meta",
  asyncHandler(async (req, res) => {
    const body = parseBody(metaSchema, req.body);
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print) throw new HttpError(404, "Print not found");

    const data: Prisma.PrintUpdateInput = {};
    const requestedName = body.name !== undefined ? body.name : body.title;
    if (requestedName !== undefined) {
      const nextName = await uniqueModelName(requestedName, print.folderId, print.id);
      if (nextName !== print.name) {
        data.name = nextName;
        data.nameNormalized = nextName.trim().toLowerCase();
        data.title = nextName;
      }
    }
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.creator !== undefined) data.creator = body.creator.trim() || null;
    if (body.collection !== undefined) data.collection = body.collection.trim() || null;

    const updated = await prisma.print.update({ where: { id: print.id }, data });
    const plates = await prisma.plate.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } });
    await relocatePrint(updated, plates);
    res.json({ print: await printOutById(print.id) });
  }),
);

const folderUpdateSchema = z.object({ folder_id: z.string().nullable().optional() });
router.post(
  "/print/:id/folder",
  asyncHandler(async (req, res) => {
    const body = parseBody(folderUpdateSchema, req.body);
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print) throw new HttpError(404, "Print not found");
    const folderId = body.folder_id || null;
    const data: Prisma.PrintUpdateInput = {};
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder) throw new HttpError(400, "Folder not found");
      await uniqueModelName(print.name, folder.id, print.id);
      data.folder = { connect: { id: folder.id } };
    } else {
      await uniqueModelName(print.name, null, print.id);
      data.folder = { disconnect: true };
    }
    const updated = await prisma.print.update({ where: { id: print.id }, data });
    const plates = await prisma.plate.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } });
    await relocatePrint(updated, plates);
    res.json({ print: await printOutById(print.id) });
  }),
);

router.delete(
  "/print/:id",
  asyncHandler(async (req, res) => {
    const full = await loadFullPrint(req.params.id);
    await deleteAllPrintFiles(req.params.id);
    await prisma.print.delete({ where: { id: req.params.id } });
    for (const plate of full.plates) {
      await deletePlateFiles(plate);
      await fs.promises.rm(plateThumbPath(plate.id), { force: true }).catch(() => undefined);
    }
    res.json({ ok: true });
  }),
);

export default router;

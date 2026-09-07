import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError, sanitizeFilename, mimeFromContentType } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { modelUpload, thumbnailUpload } from "../uploadMiddleware";
import {
  addPlatesToPrint,
  deletePlateFiles,
  refreshAutoPreparedMetadata,
  type NewPlateInput,
} from "../services/printCreation";
import { availablePlateFilename, plateThumbPath, relocatePrint, saveThumbFromBytes } from "../services/printService";
import { printOutById } from "../services/printLoader";

const router = Router();
router.use(requireAuth);

// ---- POST /print/:id/plates (append) --------------------------------------------------------

router.post(
  "/print/:id/plates",
  modelUpload.array("files"),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    try {
      if (!files.length) throw new HttpError(400, "No files uploaded");
      const print = await prisma.print.findUnique({ where: { id: req.params.id } });
      if (!print) throw new HttpError(404, "Print not found");

      const plateInputs: NewPlateInput[] = files.map((f) => {
        const safeName = sanitizeFilename(f.originalname);
        return { filename: safeName, mime: mimeFromContentType(f.mimetype, safeName), tempFilePath: f.path };
      });
      await addPlatesToPrint(print.id, plateInputs);
      res.json({ print: await printOutById(print.id) });
    } finally {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
      }
    }
  }),
);

// ---- DELETE /print/:id/plates/:plateId --------------------------------------------------------

router.delete(
  "/print/:id/plates/:plateId",
  asyncHandler(async (req, res) => {
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print) throw new HttpError(404, "Print not found");
    const plates = await prisma.plate.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } });
    const target = plates.find((p) => p.id === req.params.plateId);
    if (!target) throw new HttpError(404, "Plate not found");
    if (plates.length <= 1) {
      throw new HttpError(409, "Cannot remove the only plate of a print; delete the print instead.");
    }

    const remaining = plates.filter((p) => p.id !== target.id);
    // Delete the target first to free its position slot, then renumber densely via the same
    // two-phase (negative temp position) trick as reorder, to avoid transient collisions with
    // the (printId, position) unique index regardless of update ordering.
    await prisma.plate.delete({ where: { id: target.id } });
    await prisma.$transaction(
      remaining.map((p, idx) => prisma.plate.update({ where: { id: p.id }, data: { position: -(idx + 1) } })),
    );
    await prisma.$transaction(
      remaining.map((p, idx) => prisma.plate.update({ where: { id: p.id }, data: { position: idx } })),
    );
    await deletePlateFiles(target);
    await fs.promises.rm(plateThumbPath(target.id), { force: true }).catch(() => undefined);

    if (target.position === 0) {
      await refreshAutoPreparedMetadata(print.id);
    }
    res.json({ print: await printOutById(print.id) });
  }),
);

// ---- POST /print/:id/plates/reorder ------------------------------------------------------------

const reorderSchema = z.object({ plate_ids: z.array(z.string()).min(1) });
router.post(
  "/print/:id/plates/reorder",
  asyncHandler(async (req, res) => {
    const body = parseBody(reorderSchema, req.body);
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print) throw new HttpError(404, "Print not found");
    const plates = await prisma.plate.findMany({ where: { printId: print.id } });
    const byId = new Map(plates.map((p) => [p.id, p]));
    if (body.plate_ids.length !== plates.length || body.plate_ids.some((id) => !byId.has(id))) {
      throw new HttpError(400, "plate_ids must contain exactly the print's current plate ids");
    }
    const previousFirst = plates.toSorted((a, b) => a.position - b.position)[0]?.id;

    // Two-phase update avoids transient collisions with the (printId, position) unique index.
    await prisma.$transaction(
      body.plate_ids.map((id, idx) => prisma.plate.update({ where: { id }, data: { position: -(idx + 1) } })),
    );
    await prisma.$transaction(
      body.plate_ids.map((id, idx) => prisma.plate.update({ where: { id }, data: { position: idx } })),
    );

    if (previousFirst !== body.plate_ids[0]) {
      await refreshAutoPreparedMetadata(print.id);
    }
    res.json({ print: await printOutById(print.id) });
  }),
);

// ---- POST /print/:id/plate/:plateId/rename -----------------------------------------------------

const renameSchema = z.object({ filename: z.string().min(1) });
router.post(
  "/print/:id/plate/:plateId/rename",
  asyncHandler(async (req, res) => {
    const body = parseBody(renameSchema, req.body);
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print) throw new HttpError(404, "Print not found");
    const plate = await prisma.plate.findUnique({ where: { id: req.params.plateId } });
    if (!plate || plate.printId !== print.id) throw new HttpError(404, "Plate not found");

    const sanitized = sanitizeFilename(body.filename);
    const nextFilename = await availablePlateFilename(print.id, sanitized, plate.id);
    if (nextFilename !== plate.filename) {
      await prisma.plate.update({ where: { id: plate.id }, data: { filename: nextFilename } });
      await relocatePrint(print, [{ ...plate, filename: nextFilename }]);
      if (plate.position === 0) {
        await refreshAutoPreparedMetadata(print.id);
      }
    }
    res.json({ print: await printOutById(print.id) });
  }),
);

// ---- Plate thumbnails --------------------------------------------------------------------------

router.get(
  "/plate/:plateId/thumb.jpg",
  asyncHandler(async (req, res) => {
    const plate = await prisma.plate.findUnique({ where: { id: req.params.plateId } });
    if (!plate) throw new HttpError(404, "Not found");
    const thumbPath = plateThumbPath(plate.id);
    if (!fs.existsSync(thumbPath)) throw new HttpError(404, "Not found");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(path.resolve(thumbPath));
  }),
);

router.post(
  "/plate/:plateId/thumbnail-generated",
  thumbnailUpload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");
    if (!["image/png", "image/jpeg", "image/webp"].includes((file.mimetype || "").toLowerCase())) {
      throw new HttpError(415, "Generated thumbnail must be PNG, JPEG, or WebP");
    }
    if (file.size > 8 * 1024 * 1024) throw new HttpError(413, "Generated thumbnail exceeds 8 MB");
    const plate = await prisma.plate.findUnique({ where: { id: req.params.plateId } });
    if (!plate) throw new HttpError(404, "Not found");
    const ok = await saveThumbFromBytes(plate.id, file.buffer);
    if (!ok) throw new HttpError(400, "Invalid thumbnail image");
    res.json({ print: await printOutById(plate.printId) });
  }),
);

export default router;

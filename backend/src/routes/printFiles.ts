import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { asyncHandler } from "../utils/asyncHandler";
import { modelUpload } from "../uploadMiddleware";
import {
  deletePreparedFile,
  deleteSupportingFile,
  listSupportingFiles,
  managedPrintFilePath,
  saveFileFromTemp,
} from "../services/printFileService";
import { toPrintFileOut } from "../dto";
import { printOutById } from "../services/printLoader";

const router = Router();
router.use(requireAuth);

router.get(
  "/print/:id/files",
  asyncHandler(async (req, res) => {
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print) throw new HttpError(404, "Print not found");
    const files = await listSupportingFiles(print.id);
    res.json(files.map(toPrintFileOut));
  }),
);

router.post(
  "/print/:id/files",
  modelUpload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    try {
      if (!file) throw new HttpError(400, "No file uploaded");
      const print = await prisma.print.findUnique({ where: { id: req.params.id } });
      if (!print) throw new HttpError(404, "Print not found");
      await saveFileFromTemp(print.id, file.path, file.originalname || "supporting-file", file.mimetype);
      res.json({ print: await printOutById(print.id) });
    } finally {
      if (file && fs.existsSync(file.path)) fs.rmSync(file.path, { force: true });
    }
  }),
);

router.get(
  "/print/:id/files/:fileId",
  asyncHandler(async (req, res) => {
    const record = await prisma.printFile.findUnique({ where: { id: req.params.fileId } });
    if (!record || record.printId !== req.params.id || record.role !== "SUPPORTING") {
      throw new HttpError(404, "Not found");
    }
    const filePath = managedPrintFilePath(record);
    if (!fs.existsSync(filePath)) throw new HttpError(404, "Not found");
    res.setHeader("Content-Type", record.mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(record.filename)}"`);
    res.sendFile(path.resolve(filePath));
  }),
);

router.delete(
  "/print/:id/files/:fileId",
  asyncHandler(async (req, res) => {
    const print = await deleteSupportingFile(req.params.id, req.params.fileId);
    res.json({ print: await printOutById(print.id) });
  }),
);

router.get(
  "/print/:id/prepared-print",
  asyncHandler(async (req, res) => {
    const print = await prisma.print.findUnique({ where: { id: req.params.id } });
    if (!print || !print.preparedFileId) throw new HttpError(404, "Not found");
    const record = await prisma.printFile.findUnique({ where: { id: print.preparedFileId } });
    if (!record || record.printId !== print.id || record.role !== "PREPARED") throw new HttpError(404, "Not found");
    const filePath = managedPrintFilePath(record);
    if (!fs.existsSync(filePath)) throw new HttpError(404, "Not found");
    res.setHeader("Content-Type", record.mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(record.filename)}"`);
    res.sendFile(path.resolve(filePath));
  }),
);

router.delete(
  "/print/:id/prepared-print",
  asyncHandler(async (req, res) => {
    const print = await deletePreparedFile(req.params.id);
    res.json({ print: await printOutById(print.id) });
  }),
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { validateParentFolder } from "../services/folderService";
import { availableModelName, reorganizeManagedPrints } from "../services/printService";
import { toFolderOut } from "../dto";
import { sendPrintsZip } from "../services/downloadZip";
import type { Prisma } from "@prisma/client";

const router = Router();
router.use(requireAuth);

const folderSchema = z.object({
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  parent_id: z.string().nullable().optional(),
});

router.get(
  "/folders",
  asyncHandler(async (_req, res) => {
    const folders = await prisma.folder.findMany();
    res.json(folders.map(toFolderOut));
  }),
);

router.post(
  "/folders",
  asyncHandler(async (req, res) => {
    const body = parseBody(folderSchema, req.body);
    const parentId = await validateParentFolder(body.parent_id ?? null);
    const folder = await prisma.folder.create({
      data: { name: body.name, tags: body.tags.map((t) => t.trim()).filter(Boolean), parentId },
    });
    res.json(toFolderOut(folder));
  }),
);

router.patch(
  "/folder/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(folderSchema, req.body);
    const folder = await prisma.folder.findUnique({ where: { id: req.params.id } });
    if (!folder) throw new HttpError(404, "Not found");
    const parentId = await validateParentFolder(body.parent_id ?? null, folder.id);
    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: { name: body.name, tags: body.tags.map((t) => t.trim()).filter(Boolean), parentId },
    });
    await reorganizeManagedPrints();
    res.json(toFolderOut(updated));
  }),
);

router.delete(
  "/folder/:id",
  asyncHandler(async (req, res) => {
    const folder = await prisma.folder.findUnique({ where: { id: req.params.id } });
    if (!folder) throw new HttpError(404, "Not found");

    await prisma.folder.updateMany({ where: { parentId: folder.id }, data: { parentId: null } });

    const prints = await prisma.print.findMany({ where: { folderId: folder.id } });
    for (const print of prints) {
      const nextName = await availableModelName(print.name, null, print.id);
      const data: Prisma.PrintUpdateInput = { folder: { disconnect: true } };
      if (nextName !== print.name) {
        data.name = nextName;
        data.nameNormalized = nextName.trim().toLowerCase();
        data.title = nextName;
      }
      await prisma.print.update({ where: { id: print.id }, data });
    }

    await prisma.folder.delete({ where: { id: folder.id } });
    await reorganizeManagedPrints();
    res.json({ ok: true });
  }),
);

router.get(
  "/folder/:id/download",
  asyncHandler(async (req, res) => {
    const folder = await prisma.folder.findUnique({ where: { id: req.params.id } });
    if (!folder) throw new HttpError(404, "Folder not found");
    const prints = await prisma.print.findMany({
      where: { folderId: folder.id },
      include: { plates: { orderBy: { position: "asc" } }, folder: true },
    });
    const downloadName = `${(folder.name || "folder").replace(/ /g, "_").slice(0, 50) || "folder"}.zip`;
    await sendPrintsZip(res, prints, downloadName);
  }),
);

export default router;

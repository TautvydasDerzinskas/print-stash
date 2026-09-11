import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  assertCollectionNameAvailable,
  isSystemCollectionId,
  listSystemCollectionOuts,
  loadSystemCollectionOut,
  normalizeCollectionName,
  systemCollectionKeyForId,
} from "../services/collectionService";
import { printOutsByIds } from "../services/printLoader";
import { createLog } from "../services/auditLog";
import { toCollectionOut, type PrintOut } from "../dto";

const router = Router();
router.use(requireAuth);

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string()).default([]),
});

const COVER_ITEM_LIMIT = 4;

router.get(
  "/collections",
  asyncHandler(async (req, res) => {
    const [systemCollections, collections] = await Promise.all([
      listSystemCollectionOuts(req.userId!),
      prisma.collection.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { items: true } },
          items: { orderBy: { position: "asc" }, take: COVER_ITEM_LIMIT },
        },
      }),
    ]);
    const coverPrintIds = collections.flatMap((c) => c.items.map((i) => i.printId));
    const printOuts = await printOutsByIds(req.userId!, coverPrintIds);
    res.json([
      ...systemCollections,
      ...collections.map((c) =>
        toCollectionOut(
          c,
          c._count.items,
          c.items.map((i) => printOuts.get(i.printId)).filter((p): p is PrintOut => Boolean(p)),
        ),
      ),
    ]);
  }),
);

router.post(
  "/collections",
  asyncHandler(async (req, res) => {
    const body = parseBody(collectionSchema, req.body);
    await assertCollectionNameAvailable(req.userId!, body.name);
    const collection = await prisma.collection.create({
      data: {
        userId: req.userId!,
        name: body.name,
        nameNormalized: normalizeCollectionName(body.name),
        description: body.description?.trim() || null,
        tags: body.tags.map((t) => t.trim()).filter(Boolean),
      },
    });
    res.json(toCollectionOut(collection, 0, []));
    void createLog({
      userId: req.userId!,
      action: "collection_created",
      targetId: collection.id,
      details: { name: collection.name },
    });
  }),
);

router.get(
  "/collection/:id",
  asyncHandler(async (req, res) => {
    const systemKey = systemCollectionKeyForId(req.params.id);
    if (systemKey) {
      res.json(await loadSystemCollectionOut(req.userId!, systemKey));
      return;
    }
    const collection = await prisma.collection.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { _count: { select: { items: true } } },
    });
    if (!collection) throw new HttpError(404, "Collection not found");
    res.json(toCollectionOut(collection, collection._count.items, []));
  }),
);

router.patch(
  "/collection/:id",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be edited");
    }
    const body = parseBody(collectionSchema, req.body);
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    await assertCollectionNameAvailable(req.userId!, body.name, collection.id);
    const updated = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        name: body.name,
        nameNormalized: normalizeCollectionName(body.name),
        description: body.description?.trim() || null,
        tags: body.tags.map((t) => t.trim()).filter(Boolean),
      },
    });
    const itemCount = await prisma.collectionItem.count({ where: { collectionId: updated.id } });
    res.json(toCollectionOut(updated, itemCount, []));
    void createLog({
      userId: req.userId!,
      action: "collection_edited",
      targetId: updated.id,
      details: { name: updated.name },
    });
  }),
);

router.delete(
  "/collection/:id",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be deleted");
    }
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    await prisma.collection.delete({ where: { id: collection.id } });
    res.json({ ok: true });
    void createLog({
      userId: req.userId!,
      action: "collection_deleted",
      targetId: collection.id,
      details: { name: collection.name },
    });
  }),
);

// Drops one print's membership -- the print itself, and every other collection it's in, are
// untouched. Only meaningful for a real collection: the built-in Favourites/Browsing History
// pseudo-collections have no CollectionItem rows to remove (their membership is Print.favoritedAt
// / Print.lastViewedAt) -- the frontend routes "remove" there through unfavorite instead.
router.delete(
  "/collection/:id/items/:printId",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be edited");
    }
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    const print = await prisma.print.findFirst({ where: { id: req.params.printId, userId: req.userId } });
    if (!print) throw new HttpError(404, "Print not found");
    await prisma.collectionItem.deleteMany({ where: { collectionId: collection.id, printId: print.id } });
    res.json({ ok: true });
    void createLog({
      userId: req.userId!,
      action: "collection_item_removed",
      targetId: collection.id,
      details: { printId: print.id, name: print.name },
    });
  }),
);

export default router;

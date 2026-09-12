import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { asyncHandler } from "../utils/asyncHandler";
import { toAuthorOut } from "../dto";

const router = Router();
router.use(requireAuth);

// Author rows aren't user-scoped -- they're shared, public creator info pulled from
// MakerWorld/Thingiverse/Printables (see authorService.ts's deleteAuthorIfOrphaned, which already
// checks Print.authorId across every user, not just one), so there's no per-user ownership check
// here beyond being signed in to the instance at all.
router.get(
  "/author/:id",
  asyncHandler(async (req, res) => {
    const author = await prisma.author.findUnique({ where: { id: req.params.id } });
    if (!author) throw new HttpError(404, "Author not found");
    res.json(toAuthorOut(author));
  }),
);

export default router;

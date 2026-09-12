import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { asyncHandler } from "../utils/asyncHandler";
import { toAuthorOut, toUserOut } from "../dto";
import { getLinkedAuthorsForUser, isAuthorLinked, linkAuthorToUser } from "../services/authorService";

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
    res.json(toAuthorOut(author, await isAuthorLinked(author.id)));
  }),
);

// The Author rows the current user has claimed as themselves -- backs both the "My models" page's
// provider chips and (client-side, per author) whether to show "It's me!" on a given author page.
router.get(
  "/me/author-links",
  asyncHandler(async (req, res) => {
    const authors = await getLinkedAuthorsForUser(req.userId!);
    res.json(authors.map((a) => toAuthorOut(a, true)));
  }),
);

// The Author page's "It's me!" button, after its confirmation modal. See linkAuthorToUser's doc
// comment for the two uniqueness rules this enforces.
router.post(
  "/author/:id/link",
  asyncHandler(async (req, res) => {
    const { author, user } = await linkAuthorToUser(req.userId!, req.params.id);
    res.json({ author: toAuthorOut(author, true), user: toUserOut(user) });
  }),
);

export default router;

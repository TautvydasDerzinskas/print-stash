import { Router } from "express";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { asyncHandler } from "../utils/asyncHandler";
import { deleteAllPrintsForUser, listUsersWithPrintCounts } from "../services/adminService";

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get(
  "/admin/users",
  asyncHandler(async (_req, res) => {
    const users = await listUsersWithPrintCounts();
    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: u.displayName,
        role: u.role,
        print_count: u.printCount,
      })),
    );
  }),
);

// The two-part "select a user + type their email to confirm" flow lives entirely on the
// frontend (TriggersSection.tsx) -- this endpoint just does the (irreversible) deletion once
// asked, trusting the UI already got explicit confirmation from the admin.
router.post(
  "/admin/users/:id/delete-all-prints",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new HttpError(404, "User not found");
    const deleted = await deleteAllPrintsForUser(user.id);
    res.json({ ok: true, deleted });
  }),
);

export default router;

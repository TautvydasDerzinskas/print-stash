import { Router } from "express";
import { requireAuth } from "../auth";
import { asyncHandler } from "../utils/asyncHandler";
import { listNotifications, markAllRead } from "../services/notificationService";
import { toNotificationOut } from "../dto";

const router = Router();
router.use(requireAuth);

router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const { items, unreadCount } = await listNotifications(req.userId!);
    res.json({ items: items.map(toNotificationOut), unread_count: unreadCount });
  }),
);

router.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    await markAllRead(req.userId!);
    res.json({ ok: true });
  }),
);

export default router;

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { getAllowRegistrations } from "../services/settingsService";

const router = Router();

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, auth_required: true, allow_registrations: await getAllowRegistrations(true) });
  }),
);

export default router;

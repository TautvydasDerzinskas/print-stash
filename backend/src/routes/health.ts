import { Router } from "express";
import { AUTH_ENABLED } from "../config";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, auth_required: AUTH_ENABLED });
});

export default router;

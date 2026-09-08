import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../auth";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getAllowRegistrations,
  getPreviewMode,
  getThingiverseAccessToken,
  setAllowRegistrations,
  setPreviewMode,
  setThingiverseAccessToken,
} from "../services/settingsService";
import {
  DEFAULT_STORAGE_TEMPLATE,
  STORAGE_TEMPLATE_TOKENS,
  getStorageTemplate,
  reorganizeManagedPrints,
  samplePlateStoragePaths,
  setStorageTemplate,
  validateStorageTemplate,
} from "../services/printService";

const router = Router();
router.use(requireAuth);

function storageSettingsOut(template: string, moved = 0, skipped = 0) {
  return {
    template,
    default_template: DEFAULT_STORAGE_TEMPLATE,
    allowed_tokens: [...STORAGE_TEMPLATE_TOKENS],
    plate_paths: samplePlateStoragePaths(template),
    moved,
    skipped,
  };
}

// Admin-only end to end now: the storage template affects every user's files, and the only UI
// that reads this lives in the admin settings panel.
router.get(
  "/settings/storage",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const template = validateStorageTemplate(await getStorageTemplate());
    res.json(storageSettingsOut(template));
  }),
);

// Instance-wide: reorganizing "apply to existing" walks and relocates every user's files, not
// just the caller's, so this is admin-only.
const storageSettingsSchema = z.object({ template: z.string(), apply_existing: z.boolean().default(false) });
router.post(
  "/settings/storage",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(storageSettingsSchema, req.body);
    const template = validateStorageTemplate(body.template);
    await setStorageTemplate(template);
    const { moved, skipped } = body.apply_existing ? await reorganizeManagedPrints(template) : { moved: 0, skipped: 0 };
    res.json(storageSettingsOut(template, moved, skipped));
  }),
);

router.get(
  "/settings/registrations",
  asyncHandler(async (_req, res) => {
    res.json({ allow_registrations: await getAllowRegistrations(true) });
  }),
);

// No admin UI calls this yet -- added now so the "admin panel later" plan has a working
// endpoint to build against without another backend change.
const registrationsSchema = z.object({ allow_registrations: z.boolean() });
router.post(
  "/settings/registrations",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(registrationsSchema, req.body);
    await setAllowRegistrations(body.allow_registrations);
    res.json({ allow_registrations: body.allow_registrations });
  }),
);

// Read is open to every user -- LibraryPage needs the current mode to know whether to generate
// previews at all. Only admins can change it (see getPreviewMode's instance-wide rationale).
router.get(
  "/settings/previews",
  asyncHandler(async (_req, res) => {
    res.json({ mode: await getPreviewMode() });
  }),
);

const previewsSchema = z.object({ mode: z.enum(["automatic", "on-demand", "disabled"]) });
router.post(
  "/settings/previews",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(previewsSchema, req.body);
    await setPreviewMode(body.mode);
    res.json({ mode: body.mode });
  }),
);

// Admin-only end to end, like storage settings: the token is a shared credential for the whole
// instance's Thingiverse imports, not a per-user preference. GET never echoes the token itself
// back (write-only, like any other API secret) -- only whether one is currently configured, so
// the admin UI can show "configured" / "not configured" without re-displaying the value.
router.get(
  "/settings/thingiverse",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ configured: Boolean(await getThingiverseAccessToken()) });
  }),
);

const thingiverseSettingsSchema = z.object({ access_token: z.string().nullable() });
router.post(
  "/settings/thingiverse",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(thingiverseSettingsSchema, req.body);
    await setThingiverseAccessToken(body.access_token);
    res.json({ configured: Boolean(body.access_token && body.access_token.trim()) });
  }),
);

export default router;

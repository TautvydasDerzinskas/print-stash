import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { MOUNT_IMPORT_COPY, MOUNT_IMPORT_ENABLED, MOUNT_IMPORT_PATH } from "../config";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { getMountImportCopy, getMountImportEnabled, setMountImportCopy, setMountImportEnabled } from "../services/settingsService";
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

router.get(
  "/settings/mount-import",
  asyncHandler(async (_req, res) => {
    res.json({
      enabled: await getMountImportEnabled(MOUNT_IMPORT_ENABLED),
      copy_files: await getMountImportCopy(MOUNT_IMPORT_COPY),
      path: MOUNT_IMPORT_PATH || null,
    });
  }),
);

const mountImportSchema = z.object({ enabled: z.boolean(), copy_files: z.boolean() });
router.post(
  "/settings/mount-import",
  asyncHandler(async (req, res) => {
    const body = parseBody(mountImportSchema, req.body);
    await setMountImportEnabled(body.enabled);
    await setMountImportCopy(body.copy_files);
    res.json({
      enabled: await getMountImportEnabled(MOUNT_IMPORT_ENABLED),
      copy_files: await getMountImportCopy(MOUNT_IMPORT_COPY),
      path: MOUNT_IMPORT_PATH || null,
    });
  }),
);

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

router.get(
  "/settings/storage",
  asyncHandler(async (_req, res) => {
    const template = validateStorageTemplate(await getStorageTemplate());
    res.json(storageSettingsOut(template));
  }),
);

const storageSettingsSchema = z.object({ template: z.string(), apply_existing: z.boolean().default(false) });
router.post(
  "/settings/storage",
  asyncHandler(async (req, res) => {
    const body = parseBody(storageSettingsSchema, req.body);
    const template = validateStorageTemplate(body.template);
    await setStorageTemplate(template);
    const { moved, skipped } = body.apply_existing ? await reorganizeManagedPrints(template) : { moved: 0, skipped: 0 };
    res.json(storageSettingsOut(template, moved, skipped));
  }),
);

export default router;

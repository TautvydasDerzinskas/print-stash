import { prisma } from "../db";

// Storage-template settings (get/setStorageTemplate) live in printService.ts — not duplicated here.

const MOUNT_IMPORT_ENABLED_KEY = "mount_import_enabled";
const MOUNT_IMPORT_COPY_KEY = "mount_import_copy";

async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row === null || row === undefined) return fallback;
  return typeof row.value === "boolean" ? row.value : fallback;
}

async function setBoolSetting(key: string, value: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getMountImportEnabled(fallback: boolean): Promise<boolean> {
  return getBoolSetting(MOUNT_IMPORT_ENABLED_KEY, fallback);
}

export async function setMountImportEnabled(value: boolean): Promise<void> {
  await setBoolSetting(MOUNT_IMPORT_ENABLED_KEY, value);
}

export async function getMountImportCopy(fallback: boolean): Promise<boolean> {
  return getBoolSetting(MOUNT_IMPORT_COPY_KEY, fallback);
}

export async function setMountImportCopy(value: boolean): Promise<void> {
  await setBoolSetting(MOUNT_IMPORT_COPY_KEY, value);
}

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db";
import {
  DEFAULT_MOUNT_IMPORT_EXTS,
  IMPORT_MAX_BYTES,
  MOUNT_IMPORT_COPY,
  MOUNT_IMPORT_ENABLED,
  MOUNT_IMPORT_EXTS_RAW,
  MOUNT_IMPORT_INCLUDE_HIDDEN,
  MOUNT_IMPORT_PATH,
  STORAGE,
} from "../config";
import { sanitizeFilename, guessMimeFromPath } from "../utils/fileUtils";
import { getMountImportCopy, getMountImportEnabled } from "./settingsService";
import { resolveZipFolderId } from "./zipService";
import { createPrint } from "./printCreation";

function parseMountImportExts(raw: string): Set<string> | null {
  if (!raw) return new Set(DEFAULT_MOUNT_IMPORT_EXTS);
  const lowered = raw.trim().toLowerCase();
  if (lowered === "*") return null;
  const parts = lowered.split(/[,\s]+/).filter(Boolean);
  const exts = new Set<string>();
  for (const part of parts) {
    exts.add(part.startsWith(".") ? part : `.${part}`);
  }
  return exts.size ? exts : new Set(DEFAULT_MOUNT_IMPORT_EXTS);
}

function shouldSkipMountEntry(name: string): boolean {
  return !MOUNT_IMPORT_INCLUDE_HIDDEN && name.startsWith(".");
}

async function* walk(dir: string, skipDirNames: Set<string>): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (shouldSkipMountEntry(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue;
      yield* walk(full, skipDirNames);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * Scans a read-only host directory (IMPORT_MOUNT_PATH) for model files not yet imported and
 * creates a single-plate Print for each. Fire-and-forget: intended to run in the background
 * after the server starts listening, mirroring MakersVault's startup background thread.
 */
export async function scanMountImports(): Promise<void> {
  const root = MOUNT_IMPORT_PATH;
  if (!root) return;
  if (!(await getMountImportEnabled(MOUNT_IMPORT_ENABLED))) return;

  let rootStat;
  try {
    rootStat = await fs.stat(root);
  } catch {
    console.log(`[mount-import] Skipping: mount path not found: ${root}`);
    return;
  }
  if (!rootStat.isDirectory()) {
    console.log(`[mount-import] Skipping: mount path not found: ${root}`);
    return;
  }

  const allowedExts = parseMountImportExts(MOUNT_IMPORT_EXTS_RAW);
  const copyFiles = await getMountImportCopy(MOUNT_IMPORT_COPY);
  const rootAbs = path.resolve(root);
  const rootPrefix = rootAbs.replace(/\/+$/, "");
  const storageAbs = path.resolve(STORAGE);
  const skipStorageDirs = rootAbs === storageAbs;
  const skipDirNames = skipStorageDirs ? new Set(["thumbs", "bundles"]) : new Set<string>();

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[mount-import] Scanning ${rootAbs}...`);

  const existingRows = await prisma.plate.findMany({
    where: { sourcePath: { startsWith: `${rootPrefix}/` } },
    select: { sourcePath: true },
  });
  const existingSources = new Set(existingRows.map((r) => r.sourcePath).filter((s): s is string => !!s));

  const folderCache = new Map<string, string>();

  for await (const filePath of walk(rootAbs, skipDirNames)) {
    const filename = path.basename(filePath);
    if (shouldSkipMountEntry(filename)) continue;
    const ext = path.extname(filename).toLowerCase();
    if (allowedExts !== null && !allowedExts.has(ext)) continue;

    const relPath = path.relative(rootAbs, filePath).split(path.sep).join("/");
    const sourcePath = `${rootPrefix}/${relPath}`;
    if (existingSources.has(sourcePath)) {
      skipped += 1;
      continue;
    }

    let size: number;
    try {
      size = (await fs.stat(filePath)).size;
    } catch {
      failed += 1;
      continue;
    }
    if (size > IMPORT_MAX_BYTES) {
      failed += 1;
      continue;
    }

    try {
      const folderId = await resolveZipFolderId(null, relPath, folderCache);
      const safeName = sanitizeFilename(filename);
      const mime = guessMimeFromPath(filePath);
      await createPrint({ folderId }, path.parse(safeName).name, [
        {
          filename: safeName,
          mime,
          size,
          sourcePath: filePath,
          copyFromPath: copyFiles ? filePath : undefined,
        },
      ]);
      imported += 1;
      existingSources.add(sourcePath);
    } catch {
      failed += 1;
    }
  }

  console.log(`[mount-import] Done. Imported ${imported}, skipped ${skipped}, failed ${failed}.`);
}

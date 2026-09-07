import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "../utils/fileUtils";
import { STORAGE, THUMBS } from "../config";
import { prisma } from "../db";
import { listZipEntries, readZipEntry } from "../utils/zipReader";
import type { Folder, Plate, Print } from "@prisma/client";

export const STORAGE_TEMPLATE_TOKENS = [
  "folder",
  "collection",
  "tags",
  "creator",
  "model",
  "name",
  "filename",
  "id",
  "plate",
] as const;

export const DEFAULT_STORAGE_TEMPLATE = "{folder}/{model}/{filename}";

const TOKEN_RE = /\{([a-z_]+)\}/g;
// oxlint-disable-next-line no-control-regex -- stripping control chars is the point here.
const INVALID_SEGMENT_RE = /[<>:"|?*\x00-\x1f]/g;

export function sanitizePathSegment(value: string | null | undefined, fallback: string): string {
  let cleaned = (value || "").trim().replace(INVALID_SEGMENT_RE, "_");
  cleaned = cleaned.replace(/\//g, "_").replace(/\\/g, "_").replace(/^[ .]+|[ .]+$/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "..") cleaned = fallback;
  return cleaned.slice(0, 120);
}

export function validateStorageTemplate(template: string | null | undefined): string {
  const normalized = (template || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) throw new HttpError(400, "Storage template cannot be empty");
  const tokens = [...normalized.matchAll(TOKEN_RE)].map((m) => m[1]);
  const unknown = tokens.filter((t) => !(STORAGE_TEMPLATE_TOKENS as readonly string[]).includes(t));
  if (unknown.length) throw new HttpError(400, `Unknown storage token: {${unknown[0]}}`);
  const filenameCount = (normalized.match(/\{filename\}/g) || []).length;
  if (filenameCount !== 1) throw new HttpError(400, "Storage template must contain {filename} exactly once");
  const finalSegment = normalized.split("/").pop() || "";
  if (!finalSegment.includes("{filename}")) {
    throw new HttpError(400, "{filename} must be in the final path segment");
  }
  const stripped = normalized.replace(TOKEN_RE, "");
  if (stripped.includes("{") || stripped.includes("}")) {
    throw new HttpError(400, "Storage template contains an invalid token");
  }
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new HttpError(400, "Storage template contains an unsafe path segment");
  }
  return normalized;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_RE, (_match, token: string) => {
    if (!(token in values)) throw new HttpError(400, `Unknown storage token: {${token}}`);
    return values[token];
  });
}

export async function folderSegments(userId: string, folderId: string | null | undefined): Promise<string[]> {
  if (!folderId) return ["Unassigned"];
  const segments: string[] = [];
  const visited = new Set<string>();
  let current: Folder | null = await prisma.folder.findFirst({ where: { id: folderId, userId } });
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift(sanitizePathSegment(current.name, "Folder"));
    current = current.parentId ? await prisma.folder.findFirst({ where: { id: current.parentId, userId } }) : null;
  }
  return segments.length ? segments : ["Unassigned"];
}

function assertWithinStorage(relative: string): string {
  const candidate = path.resolve(STORAGE, relative);
  const root = path.resolve(STORAGE);
  if (candidate === root || !candidate.startsWith(root + path.sep)) {
    throw new HttpError(400, "Storage template resolved outside the storage directory");
  }
  return relative;
}

type PrintLike = Pick<Print, "id" | "name" | "creator" | "collection" | "tags" | "folderId" | "userId">;

/** Renders the on-disk relative path for one plate of a print using the storage template.
 * Every user's files live under their own u-<userId> segment beneath the (instance-wide)
 * rendered template, invisibly -- the template's own tokens/UX are unaware of it. */
export async function renderPlateStoragePath(
  print: PrintLike,
  plateFilename: string,
  platePosition: number,
  template?: string | null,
): Promise<string> {
  const safeTemplate = validateStorageTemplate(template ?? (await getStorageTemplate()));
  const tagLabel = (print.tags || []).map((t) => t.trim()).filter(Boolean).join(" + ") || "Untagged";
  const modelLabel = sanitizePathSegment(print.name, "Model");
  const values: Record<string, string> = {
    folder: (await folderSegments(print.userId, print.folderId)).join("/"),
    collection: sanitizePathSegment(print.collection || "Uncollected", "Uncollected"),
    tags: sanitizePathSegment(tagLabel, "Untagged"),
    creator: sanitizePathSegment(print.creator || "Unknown creator", "Unknown creator"),
    model: modelLabel,
    name: modelLabel,
    filename: sanitizePathSegment(plateFilename, "file"),
    id: print.id,
    plate: String(platePosition + 1),
  };
  const rendered = renderTemplate(safeTemplate, values).replace(/\\/g, "/");
  const parts = rendered.split("/").filter(Boolean).map((part) => sanitizePathSegment(part, "item"));
  if (!parts.length) throw new HttpError(400, "Storage template produced an empty path");
  const userSegment = sanitizePathSegment(`u-${print.userId}`, "user");
  return assertWithinStorage(path.join(userSegment, ...parts));
}

export function samplePlateStoragePaths(template: string): [string, string] {
  const safeTemplate = validateStorageTemplate(template);
  const base = {
    folder: "Props/Workshop",
    collection: "Tabletop",
    tags: "Print in place + Useful",
    creator: "Example creator",
    model: "Multi-part gadget",
    name: "Multi-part gadget",
    id: "a1b2c3d4",
  };
  const first = renderTemplate(safeTemplate, { ...base, filename: "Base.3mf", plate: "1" });
  const second = renderTemplate(safeTemplate, { ...base, filename: "Lid.3mf", plate: "2" });
  return [first, second];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Throws 409 if `requested` is already taken in this folder (for this user). Used for
 * explicit renames. */
export async function uniqueModelName(
  userId: string,
  requested: string,
  folderId: string | null,
  excludeId?: string,
): Promise<string> {
  const base = sanitizePathSegment(requested, "Model");
  const existing = await prisma.print.findFirst({
    where: {
      userId,
      folderId: folderId ?? null,
      nameNormalized: normalizeName(base),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing) throw new HttpError(409, `A print named "${base}" already exists in this folder`);
  return base;
}

/** Auto-suffixes `requested` until it's free in this folder (for this user). Used for
 * creation/reassignment. */
export async function availableModelName(
  userId: string,
  requested: string,
  folderId: string | null,
  excludeId?: string,
): Promise<string> {
  const base = sanitizePathSegment(requested, "Model");
  let candidate = base;
  let suffix = 2;
  // Small folders in practice; a loop of sequential existence checks is simple and correct.
  for (;;) {
    const existing = await prisma.print.findFirst({
      where: {
        userId,
        folderId: folderId ?? null,
        nameNormalized: normalizeName(candidate),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
}

/** Auto-suffixes a plate's filename until it's unique among its print's other plates. */
export async function availablePlateFilename(
  printId: string,
  desiredFilename: string,
  excludePlateId?: string,
): Promise<string> {
  const siblings = await prisma.plate.findMany({
    where: { printId, ...(excludePlateId ? { id: { not: excludePlateId } } : {}) },
    select: { filename: true },
  });
  const taken = new Set(siblings.map((p) => p.filename.toLowerCase()));
  if (!taken.has(desiredFilename.toLowerCase())) return desiredFilename;
  const ext = path.extname(desiredFilename);
  const stem = path.basename(desiredFilename, ext);
  let suffix = 2;
  for (;;) {
    const candidate = `${stem} (${suffix})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    suffix += 1;
  }
}

export function managedPlatePath(plate: Pick<Plate, "storagePath">): string {
  return path.join(STORAGE, plate.storagePath);
}

export async function pruneEmptyStorageDirs(start: string): Promise<void> {
  const root = path.resolve(STORAGE);
  let current = start;
  while (fsSync.existsSync(current) && path.resolve(current) !== root && path.resolve(current).startsWith(root)) {
    try {
      await fs.rmdir(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

/**
 * Re-renders and (if needed) moves every plate of a print after a name/folder/tag/creator/
 * collection change. Mirrors MakersVault's relocate_asset, generalized to N plates. Supporting
 * and prepared PrintFiles are never touched here — they live at a fixed bundles/ path.
 */
export async function relocatePrint(print: PrintLike, plates: Plate[], template?: string | null): Promise<void> {
  for (const plate of plates) {
    const oldPath = managedPlatePath(plate);
    const newRelative = await renderPlateStoragePath(print, plate.filename, plate.position, template);
    const newPath = path.join(STORAGE, newRelative);
    if (path.resolve(oldPath) === path.resolve(newPath)) {
      if (plate.storagePath !== newRelative) {
        await prisma.plate.update({ where: { id: plate.id }, data: { storagePath: newRelative } });
      }
      continue;
    }
    const collision = await prisma.plate.findFirst({ where: { storagePath: newRelative, id: { not: plate.id } } });
    if (collision) throw new HttpError(409, `Storage path already exists: ${newRelative}`);
    const oldExists = fsSync.existsSync(oldPath);
    if (oldExists) {
      await fs.mkdir(path.dirname(newPath), { recursive: true });
      await fs.rename(oldPath, newPath);
      await pruneEmptyStorageDirs(path.dirname(oldPath));
    }
    await prisma.plate.update({ where: { id: plate.id }, data: { storagePath: newRelative } });
  }
}

/** Re-lays-out managed print storage. Pass `userId` for a folder rename/delete affecting only
 * that user's own prints; omit it for an instance-wide storage-template change (admin-only --
 * see requireAdmin on POST /settings/storage), which needs to touch every user's files. */
export async function reorganizeManagedPrints(
  template?: string | null,
  userId?: string,
): Promise<{ moved: number; skipped: number }> {
  let moved = 0;
  let skipped = 0;
  const prints = await prisma.print.findMany({
    where: userId ? { userId } : undefined,
    include: { plates: true },
    orderBy: { id: "asc" },
  });
  for (const print of prints) {
    try {
      const before = new Map(print.plates.map((p) => [p.id, p.storagePath]));
      await relocatePrint(print, print.plates, template);
      const after = await prisma.plate.findMany({ where: { printId: print.id } });
      for (const plate of after) {
        if (before.get(plate.id) !== plate.storagePath) moved += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { moved, skipped };
}

// -- Settings (storage template) -----------------------------------------

export async function getStorageTemplate(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: "storage_path_template" } });
  return typeof row?.value === "string" ? row.value : DEFAULT_STORAGE_TEMPLATE;
}

export async function setStorageTemplate(value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "storage_path_template" },
    create: { key: "storage_path_template", value },
    update: { value },
  });
}

// -- Thumbnails -------------------------------------------------------------

async function saveThumbBuffer(plateId: string, input: Buffer): Promise<boolean> {
  const dest = path.join(THUMBS, `${plateId}.jpg`);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    await sharp(input)
      .flatten({ background: { r: 248, g: 250, b: 252 } })
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, dest);
    return true;
  } catch {
    await fs.rm(tmp, { force: true });
    return false;
  }
}

export async function saveThumbFromFile(plateId: string, srcPath: string): Promise<boolean> {
  try {
    const buf = await fs.readFile(srcPath);
    return await saveThumbBuffer(plateId, buf);
  } catch {
    return false;
  }
}

export async function saveThumbFromBytes(plateId: string, data: Buffer): Promise<boolean> {
  return saveThumbBuffer(plateId, data);
}

const THUMBNAIL_ENTRY_PRIORITY: Record<string, number> = {
  "metadata/thumbnail.png": 0,
  "3d/thumbnail.png": 1,
  "thumbnail.png": 2,
};

/** Extracts an embedded thumbnail image from a .3mf archive's zip payload, if present. */
export async function extract3mfThumbnail(plateId: string, srcPath: string): Promise<boolean> {
  if (!srcPath.toLowerCase().endsWith(".3mf")) return false;
  try {
    const entries = await listZipEntries(srcPath);
    const imageNames = entries
      .filter((e) => !e.isDirectory)
      .filter((e) => /\.(png|jpe?g|webp)$/i.test(e.name) && /thumbnail/i.test(path.basename(e.name)))
      .filter((e) => e.size <= 16 * 1024 * 1024)
      .toSorted((a, b) => {
        const pa = THUMBNAIL_ENTRY_PRIORITY[a.name.toLowerCase().replace(/^\//, "")] ?? 10;
        const pb = THUMBNAIL_ENTRY_PRIORITY[b.name.toLowerCase().replace(/^\//, "")] ?? 10;
        return pa - pb || a.name.length - b.name.length;
      });
    for (const entry of imageNames) {
      const buf = await readZipEntry(srcPath, entry.name, 16 * 1024 * 1024);
      if (buf && (await saveThumbBuffer(plateId, buf))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function ensurePlateThumbnail(plateId: string, srcPath: string): Promise<boolean> {
  const existing = path.join(THUMBS, `${plateId}.jpg`);
  if (fsSync.existsSync(existing)) return true;
  return extract3mfThumbnail(plateId, srcPath);
}

export function plateThumbPath(plateId: string): string {
  return path.join(THUMBS, `${plateId}.jpg`);
}

export function plateThumbExists(plateId: string): boolean {
  return fsSync.existsSync(plateThumbPath(plateId));
}

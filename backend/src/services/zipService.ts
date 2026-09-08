import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../db";
import { HttpError, sanitizeFilename, guessMimeFromPath } from "../utils/fileUtils";
import { IMPORT_MAX_BYTES } from "../config";
import { listZipEntries as listRawZipEntries, readZipEntry } from "../utils/zipReader";
import { validateParentFolder } from "./folderService";
import { attachImportedPreviewImages } from "./importService";
import { createPrint, type PrintMetaInput } from "./printCreation";
import type { Print, Plate, PreviewImage } from "@prisma/client";

export type ZipEntrySummary = { path: string; size: number };

/** Normalizes a raw zip entry name: backslashes -> slashes, strips leading slash, rejects
 * empty/directory/".."-containing paths. Returns null if the entry should be ignored. */
export function normalizeZipEntryPath(name: string): string | null {
  let cleaned = (name || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.endsWith("/")) return null;
  const parts = cleaned.split("/").filter((p) => p.length > 0);
  if (!parts.length || parts.some((p) => p === "..")) return null;
  const filtered = parts.filter((p) => p !== ".");
  if (!filtered.length) return null;
  return filtered.join("/");
}

function sanitizeFolderName(name: string): string {
  const cleaned = (name || "").replace(/\0/g, "").trim().replace(/\//g, "_").replace(/\\/g, "_");
  return cleaned || "folder";
}

/** Lists every real (non-directory) entry in a zip archive, path-normalized and sorted. */
export async function listZipEntries(zipPath: string): Promise<ZipEntrySummary[]> {
  const raw = await listRawZipEntries(zipPath);
  const entries: ZipEntrySummary[] = [];
  for (const entry of raw) {
    if (entry.isDirectory) continue;
    const name = normalizeZipEntryPath(entry.name);
    if (!name) continue;
    entries.push({ path: name, size: entry.size });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return entries;
}

type FolderCache = Map<string, string>;

async function getOrCreateFolder(
  userId: string,
  parentId: string | null,
  parentKey: string,
  name: string,
  cache: FolderCache,
): Promise<string> {
  const key = `${parentKey}/${name}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = await prisma.folder.findFirst({ where: { userId, parentId, name } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const folder = await prisma.folder.create({ data: { userId, name, parentId, tags: [] } });
  cache.set(key, folder.id);
  return folder.id;
}

/** Recreates the zip's directory structure as nested Folders, returning the leaf folder id
 * for one entry's path. Mirrors MakersVault's resolve_zip_folder_id. */
export async function resolveZipFolderId(
  userId: string,
  baseFolderId: string | null,
  entryPath: string,
  cache: FolderCache,
): Promise<string | null> {
  const segments = entryPath.split("/").slice(0, -1).filter(Boolean);
  if (!segments.length) return baseFolderId;
  let targetId = baseFolderId;
  let parentKey = baseFolderId || "root";
  for (const segment of segments) {
    const safe = sanitizeFolderName(segment);
    if (!safe) continue;
    targetId = await getOrCreateFolder(userId, targetId, parentKey, safe, cache);
    parentKey = `${parentKey}/${safe}`;
  }
  return targetId;
}

export type ZipExtractOptions = {
  title?: string | null;
  notes?: string | null;
  tags?: string[];
  folderId?: string | null;
  creator?: string | null;
  authorId?: string | null;
  previewImageUrl?: string | null;
  galleryImages?: { url: string; filename: string }[];
};

/**
 * Extracts selected zip entries into individual single-plate Prints (one per entry). Each
 * entry lands in a Folder tree recreated from its path within the zip (nested under
 * options.folderId, if any). Returns the created prints plus the list of entry names that
 * failed to extract (missing, a directory, or over the size cap).
 */
export async function extractZipEntriesToPrints(
  userId: string,
  zipPath: string,
  selections: string[],
  options: ZipExtractOptions,
  onProgress?: (processed: number, total: number, imported: number, failed: number) => void,
): Promise<{ prints: (Print & { plates: Plate[]; previewImages: PreviewImage[] })[]; failed: string[] }> {
  const normalized = selections.map((s) => normalizeZipEntryPath(s));
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const name of normalized) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  if (!ordered.length) throw new HttpError(400, "No zip entries selected");

  if (options.folderId) {
    await validateParentFolder(userId, options.folderId);
  }

  const raw = await listRawZipEntries(zipPath);
  const entryMap = new Map<string, { isDirectory: boolean; size: number }>();
  for (const entry of raw) {
    const name = normalizeZipEntryPath(entry.name);
    if (!name) continue;
    entryMap.set(name, { isDirectory: entry.isDirectory, size: entry.size });
  }

  const prints: (Print & { plates: Plate[]; previewImages: PreviewImage[] })[] = [];
  const failed: string[] = [];
  const folderCache: FolderCache = new Map();
  let processedCount = 0;

  for (const entryName of ordered) {
    const info = entryMap.get(entryName);
    if (!info || info.isDirectory) {
      failed.push(entryName);
      continue;
    }
    let tempPath: string | null = null;
    try {
      const targetFolderId = await resolveZipFolderId(userId, options.folderId ?? null, entryName, folderCache);
      const filename = sanitizeFilename(path.basename(entryName));
      const buffer = await readZipEntry(zipPath, entryName, IMPORT_MAX_BYTES);
      if (!buffer) throw new Error("Extracted file exceeds size limit or could not be read");

      tempPath = path.join(os.tmpdir(), `printstash-zip-${crypto.randomBytes(8).toString("hex")}`);
      await fs.writeFile(tempPath, buffer);

      // A resolved page title (e.g. MakerWorld's design name) is the same for every entry in
      // the zip, so when more than one entry is being extracted into its own Print, keep them
      // distinguishable by tagging the entry's own filename onto it instead of overwriting it
      // outright the way a single-entry extraction does.
      const resolvedTitle =
        options.title && ordered.length > 1 ? `${options.title} (${path.parse(filename).name})` : options.title;
      const meta: PrintMetaInput = {
        title: resolvedTitle ?? null,
        notes: options.notes ?? null,
        tags: options.tags ?? [],
        folderId: targetFolderId,
        creator: options.creator ?? null,
        authorId: options.authorId ?? null,
      };
      const mime = guessMimeFromPath(filename);
      const { print, plates } = await createPrint(userId, meta, path.parse(filename).name, [
        { filename, mime, tempFilePath: tempPath },
      ]);
      tempPath = null;
      await attachImportedPreviewImages(print.id, plates[0]?.id, options.previewImageUrl, options.galleryImages ?? []);
      const previewImages = await prisma.previewImage.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } });
      prints.push({ ...print, plates, previewImages });
    } catch {
      if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => undefined);
      failed.push(entryName);
    }
    onProgress?.(++processedCount, ordered.length, prints.length, failed.length);
  }

  return { prints, failed };
}

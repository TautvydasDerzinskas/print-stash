import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PREVIEWS } from "../config";
import { prisma } from "../db";
import type { PreviewImage } from "@prisma/client";

export function previewImagePath(id: string): string {
  return path.join(PREVIEWS, `${id}.jpg`);
}

export function previewImageExists(id: string): boolean {
  return fsSync.existsSync(previewImagePath(id));
}

async function saveBuffer(id: string, input: Buffer): Promise<boolean> {
  const dest = previewImagePath(id);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    // Hero-sized (larger than the 512px card thumbnail) since this is the model detail page's
    // main gallery image, not just a grid thumbnail.
    await sharp(input)
      .flatten({ background: { r: 248, g: 250, b: 252 } })
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, dest);
    return true;
  } catch {
    await fs.rm(tmp, { force: true });
    return false;
  }
}

/** Appends one preview image at the next free position. Returns null if the buffer isn't a
 * decodable image (never throws -- callers treat image fetch/generation as best-effort). */
export async function addPreviewImage(printId: string, buffer: Buffer): Promise<PreviewImage | null> {
  const last = await prisma.previewImage.findFirst({ where: { printId }, orderBy: { position: "desc" } });
  const position = last ? last.position + 1 : 0;
  const row = await prisma.previewImage.create({ data: { printId, position } });
  const ok = await saveBuffer(row.id, buffer);
  if (!ok) {
    await prisma.previewImage.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }
  return row;
}

/** Used by the "generate a preview from the 3D file" fallback: only seeds a preview image when
 * the print doesn't already have one (an import's cover photo, or an earlier generated snapshot,
 * always wins over a fresh auto-generated one). */
export async function addGeneratedPreviewImageIfNone(printId: string, buffer: Buffer): Promise<void> {
  const count = await prisma.previewImage.count({ where: { printId } });
  if (count > 0) return;
  await addPreviewImage(printId, buffer);
}

export async function deleteAllPreviewImages(printId: string): Promise<void> {
  const rows = await prisma.previewImage.findMany({ where: { printId } });
  await prisma.previewImage.deleteMany({ where: { printId } });
  for (const row of rows) {
    await fs.rm(previewImagePath(row.id), { force: true }).catch(() => undefined);
  }
}

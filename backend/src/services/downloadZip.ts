import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { Response } from "express";
import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { writeZip, type ZipEntryDescriptor } from "../utils/zipWriter";
import { resolvePlateFilePath } from "./printCreation";
import { managedPrintFilePath } from "./printFileService";
import type { Category, Plate, Print } from "@prisma/client";

type PrintWithPlatesAndCategory = Print & { plates: Plate[]; category: Category | null };

/**
 * Builds zip entries for a set of prints: `{category_or_unassigned}/{print.name}/{plate.filename}`
 * for every plate, and `.../supporting/{file.filename}` for each print's supporting files.
 */
export async function buildZipEntries(prints: PrintWithPlatesAndCategory[]): Promise<ZipEntryDescriptor[]> {
  const printIds = prints.map((p) => p.id);
  const supportingByPrint = new Map<string, { filename: string; storagePath: string }[]>();
  if (printIds.length) {
    const supporting = await prisma.printFile.findMany({
      where: { printId: { in: printIds }, role: "SUPPORTING" },
    });
    for (const file of supporting) {
      const list = supportingByPrint.get(file.printId) ?? [];
      list.push({ filename: file.filename, storagePath: file.storagePath });
      supportingByPrint.set(file.printId, list);
    }
  }

  const entries: ZipEntryDescriptor[] = [];
  for (const print of prints) {
    const categoryPart = print.category?.name || "unassigned";
    const sortedPlates = print.plates.toSorted((a, b) => a.position - b.position);
    for (const plate of sortedPlates) {
      const filePath = resolvePlateFilePath(plate);
      if (filePath) entries.push({ arcname: `${categoryPart}/${print.name}/${plate.filename}`, filePath });
    }
    for (const file of supportingByPrint.get(print.id) ?? []) {
      const filePath = managedPrintFilePath(file);
      if (fs.existsSync(filePath)) {
        entries.push({ arcname: `${categoryPart}/${print.name}/supporting/${file.filename}`, filePath });
      }
    }
  }
  return entries;
}

/** Builds a zip from `prints` and streams it as the HTTP response, deleting the temp file after. */
export async function sendPrintsZip(res: Response, prints: PrintWithPlatesAndCategory[], downloadName: string): Promise<void> {
  const entries = await buildZipEntries(prints);
  if (!entries.length) throw new HttpError(404, "No files available for download");

  const tmpPath = path.join(os.tmpdir(), `thingport-zip-${crypto.randomBytes(8).toString("hex")}.zip`);
  await writeZip(tmpPath, entries);
  res.download(tmpPath, downloadName, (err) => {
    fs.rm(tmpPath, { force: true }, () => undefined);
    if (err && !res.headersSent) {
      res.status(500).json({ detail: "Failed to send zip file" });
    }
  });
}

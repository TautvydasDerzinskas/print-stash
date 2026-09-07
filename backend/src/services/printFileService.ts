import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { STORAGE, IMPORT_MAX_BYTES } from "../config";
import { HttpError, sanitizeFilename, mimeFromContentType } from "../utils/fileUtils";
import { isPreparedPrintFilename, inspectPreparedPrint } from "./preparedPrint";
import type { Prisma, Print, PrintFile } from "@prisma/client";

export function managedPrintFilePath(printFile: Pick<PrintFile, "storagePath">): string {
  const candidate = path.resolve(STORAGE, printFile.storagePath);
  const root = path.resolve(STORAGE);
  if (candidate === root || !candidate.startsWith(root + path.sep)) {
    throw new HttpError(400, "Related file resolved outside storage");
  }
  return candidate;
}

export async function listSupportingFiles(printId: string): Promise<PrintFile[]> {
  return prisma.printFile.findMany({
    where: { printId, role: "SUPPORTING" },
    orderBy: [{ filename: "asc" }, { id: "asc" }],
  });
}

async function pruneBundleDirs(start: string): Promise<void> {
  const root = path.resolve(STORAGE, "bundles");
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
 * Saves an uploaded supporting/prepared file from a temp path onto a print. Mirrors
 * MakersVault's save_asset_file: role is auto-classified from the filename (or upgraded
 * to PREPARED after sniffing a .3mf that turns out to be a sliced gcode.3mf); a new
 * PREPARED file replaces (deletes) any existing one for the print.
 */
export async function saveFileFromTemp(
  userId: string,
  printId: string,
  tempPath: string,
  originalFilename: string,
  contentType: string | null | undefined,
): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId } });
  if (!print) throw new HttpError(404, "Print not found");

  const safeName = sanitizeFilename(originalFilename || "supporting-file");
  let role: "SUPPORTING" | "PREPARED" = isPreparedPrintFilename(safeName) ? "PREPARED" : "SUPPORTING";
  const mime = mimeFromContentType(contentType, safeName);

  const record = await prisma.printFile.create({
    data: {
      printId: print.id,
      filename: safeName,
      mime,
      role,
      storagePath: "pending",
    },
  });
  const storagePath = `bundles/${print.id}/${record.id}/${safeName}`;
  const destination = path.join(STORAGE, storagePath);

  try {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const stat = await fs.stat(tempPath);
    if (stat.size > IMPORT_MAX_BYTES) throw new HttpError(413, "Related file exceeds size limit");
    try {
      await fs.rename(tempPath, destination);
    } catch (err: any) {
      if (err?.code === "EXDEV") {
        await fs.copyFile(tempPath, destination);
        await fs.rm(tempPath, { force: true });
      } else {
        throw err;
      }
    }

    let metadata: Record<string, unknown> | null = null;
    if (role === "PREPARED" || safeName.toLowerCase().endsWith(".3mf")) {
      metadata = (await inspectPreparedPrint(destination, safeName)) as Record<string, unknown> | null;
    }
    if (metadata) role = "PREPARED";

    let oldPreparedPath: string | null = null;
    let oldPreparedId: string | null = null;
    const updatedPrint = await prisma.$transaction(async (tx) => {
      const currentPrint = await tx.print.findUnique({ where: { id: printId } });
      if (!currentPrint) throw new HttpError(404, "Print not found");
      await tx.printFile.update({
        where: { id: record.id },
        data: {
          storagePath,
          size: stat.size,
          role,
          metadata: (metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });
      if (role === "PREPARED") {
        if (currentPrint.preparedFileId && currentPrint.preparedFileId !== record.id) {
          const old = await tx.printFile.findUnique({ where: { id: currentPrint.preparedFileId } });
          if (old) {
            oldPreparedPath = managedPrintFilePath(old);
            oldPreparedId = old.id;
          }
        }
        await tx.print.update({ where: { id: printId }, data: { preparedFileId: record.id } });
        if (oldPreparedId) {
          await tx.printFile.delete({ where: { id: oldPreparedId } });
        }
      }
      return tx.print.findUniqueOrThrow({ where: { id: printId } });
    });

    if (oldPreparedPath) {
      await fs.rm(oldPreparedPath, { force: true }).catch(() => undefined);
      await pruneBundleDirs(path.dirname(oldPreparedPath));
    }
    return updatedPrint;
  } catch (err) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    await pruneBundleDirs(path.dirname(destination));
    await prisma.printFile.delete({ where: { id: record.id } }).catch(() => undefined);
    throw err;
  }
}

export async function deleteSupportingFile(userId: string, printId: string, fileId: string): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId } });
  if (!print) throw new HttpError(404, "Print not found");
  const record = await prisma.printFile.findUnique({ where: { id: fileId } });
  if (!record || record.printId !== printId || record.role !== "SUPPORTING") {
    throw new HttpError(404, "Supporting file not found");
  }
  const filePath = managedPrintFilePath(record);
  await prisma.printFile.delete({ where: { id: fileId } });
  await fs.rm(filePath, { force: true }).catch(() => undefined);
  await pruneBundleDirs(path.dirname(filePath));
  return prisma.print.findUniqueOrThrow({ where: { id: printId } });
}

export async function deleteAllPrintFiles(printId: string): Promise<void> {
  const rows = await prisma.printFile.findMany({ where: { printId } });
  const paths = rows.map((r) => managedPrintFilePath(r));
  // Print.preparedFileId FK will already be gone via cascade delete of the Print row itself,
  // but this helper runs against a still-live print (e.g. before a full print delete elsewhere).
  await prisma.printFile.deleteMany({ where: { printId } });
  for (const p of paths) {
    await fs.rm(p, { force: true }).catch(() => undefined);
    await pruneBundleDirs(path.dirname(p));
  }
}

export async function deletePreparedFile(userId: string, printId: string): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId } });
  if (!print || !print.preparedFileId) throw new HttpError(404, "No prepared print file");
  const record = await prisma.printFile.findUnique({ where: { id: print.preparedFileId } });
  if (!record || record.printId !== printId || record.role !== "PREPARED") {
    throw new HttpError(404, "No prepared print file");
  }
  const filePath = managedPrintFilePath(record);
  await prisma.$transaction([
    prisma.print.update({ where: { id: printId }, data: { preparedFileId: null } }),
    prisma.printFile.delete({ where: { id: record.id } }),
  ]);
  await fs.rm(filePath, { force: true }).catch(() => undefined);
  await pruneBundleDirs(path.dirname(filePath));
  return prisma.print.findUniqueOrThrow({ where: { id: printId } });
}

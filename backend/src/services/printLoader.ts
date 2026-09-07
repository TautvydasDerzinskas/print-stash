import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { toPrintOut, type PrintOut } from "../dto";
import type { Plate, Print, PrintFile } from "@prisma/client";

export type FullPrint = { print: Print; plates: Plate[]; files: PrintFile[]; preparedFile: PrintFile | null };

export async function loadFullPrint(printId: string): Promise<FullPrint> {
  const print = await prisma.print.findUnique({ where: { id: printId } });
  if (!print) throw new HttpError(404, "Print not found");
  const [plates, files] = await Promise.all([
    prisma.plate.findMany({ where: { printId }, orderBy: { position: "asc" } }),
    prisma.printFile.findMany({ where: { printId } }),
  ]);
  const preparedFile = print.preparedFileId
    ? await prisma.printFile.findUnique({ where: { id: print.preparedFileId } })
    : null;
  return { print, plates, files, preparedFile };
}

export async function printOutById(printId: string): Promise<PrintOut> {
  const full = await loadFullPrint(printId);
  return toPrintOut(full.print, full.plates, full.files, full.preparedFile);
}

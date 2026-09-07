import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { toPrintOut, type PrintOut } from "../dto";
import type { Author, Plate, PreviewImage, Print, PrintFile } from "@prisma/client";

export type FullPrint = {
  print: Print & { author: Author | null };
  plates: Plate[];
  files: PrintFile[];
  preparedFile: PrintFile | null;
  previewImages: PreviewImage[];
};

export async function loadFullPrint(userId: string, printId: string): Promise<FullPrint> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId }, include: { author: true } });
  if (!print) throw new HttpError(404, "Print not found");
  const [plates, files, previewImages] = await Promise.all([
    prisma.plate.findMany({ where: { printId }, orderBy: { position: "asc" } }),
    prisma.printFile.findMany({ where: { printId } }),
    prisma.previewImage.findMany({ where: { printId }, orderBy: { position: "asc" } }),
  ]);
  const preparedFile = print.preparedFileId
    ? await prisma.printFile.findUnique({ where: { id: print.preparedFileId } })
    : null;
  return { print, plates, files, preparedFile, previewImages };
}

export async function printOutById(userId: string, printId: string): Promise<PrintOut> {
  const full = await loadFullPrint(userId, printId);
  return toPrintOut(full.print, full.plates, full.files, full.preparedFile, full.print.author, full.previewImages);
}

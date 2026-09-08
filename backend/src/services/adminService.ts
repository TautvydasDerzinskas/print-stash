import fs from "node:fs/promises";
import { prisma } from "../db";
import { deleteAllPrintFiles } from "./printFileService";
import { deleteAllPreviewImages } from "./previewImageService";
import { deletePlateFiles } from "./printCreation";
import { plateThumbPath } from "./printService";
import { loadFullPrint } from "./printLoader";

export type UserWithPrintCount = {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  printCount: number;
};

export async function listUsersWithPrintCounts(): Promise<UserWithPrintCount[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      _count: { select: { prints: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    printCount: u._count.prints,
  }));
}

/** Deletes every print (and its on-disk files) belonging to `userId` -- the same per-print
 * cleanup DELETE /print/:id already does, just looped across the whole user's library. Backs
 * the admin "delete all models for a user" trigger. */
export async function deleteAllPrintsForUser(userId: string): Promise<number> {
  const prints = await prisma.print.findMany({ where: { userId }, select: { id: true } });
  for (const { id } of prints) {
    const full = await loadFullPrint(userId, id);
    await deleteAllPrintFiles(id);
    await deleteAllPreviewImages(id);
    await prisma.print.delete({ where: { id } });
    for (const plate of full.plates) {
      await deletePlateFiles(plate);
      await fs.rm(plateThumbPath(plate.id), { force: true }).catch(() => undefined);
    }
  }
  return prints.length;
}

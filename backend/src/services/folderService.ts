import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";

/** Ensures a parent folder exists (and belongs to userId) and that assigning it does not
 * introduce a cycle. */
export async function validateParentFolder(
  userId: string,
  parentId: string | null | undefined,
  folderId?: string | null,
): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.folder.findFirst({ where: { id: parentId, userId } });
  if (!parent) throw new HttpError(400, "Parent folder not found");
  if (folderId && parentId === folderId) throw new HttpError(400, "Folder cannot be its own parent");

  const visited = new Set<string>(folderId ? [folderId] : []);
  let ancestor = parent;
  while (ancestor && ancestor.parentId) {
    if (visited.has(ancestor.parentId)) throw new HttpError(400, "Invalid parent: would create a cycle");
    if (folderId && ancestor.parentId === folderId) throw new HttpError(400, "Invalid parent: would create a cycle");
    visited.add(ancestor.parentId);
    const next = await prisma.folder.findFirst({ where: { id: ancestor.parentId, userId } });
    if (!next) break;
    ancestor = next;
  }
  return parentId;
}

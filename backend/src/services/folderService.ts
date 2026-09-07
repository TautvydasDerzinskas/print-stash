import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";

/** Ensures a parent folder exists and that assigning it does not introduce a cycle. */
export async function validateParentFolder(
  parentId: string | null | undefined,
  folderId?: string | null,
): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.folder.findUnique({ where: { id: parentId } });
  if (!parent) throw new HttpError(400, "Parent folder not found");
  if (folderId && parentId === folderId) throw new HttpError(400, "Folder cannot be its own parent");

  const visited = new Set<string>(folderId ? [folderId] : []);
  let ancestor = parent;
  while (ancestor && ancestor.parentId) {
    if (visited.has(ancestor.parentId)) throw new HttpError(400, "Invalid parent: would create a cycle");
    if (folderId && ancestor.parentId === folderId) throw new HttpError(400, "Invalid parent: would create a cycle");
    visited.add(ancestor.parentId);
    const next = await prisma.folder.findUnique({ where: { id: ancestor.parentId } });
    if (!next) break;
    ancestor = next;
  }
  return parentId;
}

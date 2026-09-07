import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";

/** Ensures a parent folder exists (and belongs to userId) and that assigning it keeps the
 * category tree at most two levels deep: a category can only be nested under a top-level
 * (parent-less) category, and a category that already has subcategories of its own can't become
 * a subcategory itself -- either would create a third level. With both of those enforced, a
 * cycle is structurally impossible (a folder can never be its own ancestor), so there's nothing
 * left to walk. */
export async function validateParentFolder(
  userId: string,
  parentId: string | null | undefined,
  folderId?: string | null,
): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.folder.findFirst({ where: { id: parentId, userId } });
  if (!parent) throw new HttpError(400, "Parent folder not found");
  if (folderId && parentId === folderId) throw new HttpError(400, "Folder cannot be its own parent");

  if (parent.parentId) {
    throw new HttpError(400, "Categories can only be nested two levels deep");
  }
  if (folderId) {
    const childCount = await prisma.folder.count({ where: { parentId: folderId, userId } });
    if (childCount > 0) {
      throw new HttpError(400, "A category with subcategories cannot be moved under another category");
    }
  }

  return parentId;
}

import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { DEFAULT_CATEGORIES, type DefaultCategoryNode } from "../seedData/defaultCategories";

/** Ensures a parent category exists (and belongs to userId) and that assigning it keeps the
 * category tree at most two levels deep: a category can only be nested under a top-level
 * (parent-less) category, and a category that already has subcategories of its own can't become
 * a subcategory itself -- either would create a third level. With both of those enforced, a
 * cycle is structurally impossible (a category can never be its own ancestor), so there's nothing
 * left to walk. */
export async function validateParentCategory(
  userId: string,
  parentId: string | null | undefined,
  categoryId?: string | null,
): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.category.findFirst({ where: { id: parentId, userId } });
  if (!parent) throw new HttpError(400, "Parent category not found");
  if (categoryId && parentId === categoryId) throw new HttpError(400, "Category cannot be its own parent");

  if (parent.parentId) {
    throw new HttpError(400, "Categories can only be nested two levels deep");
  }
  if (categoryId) {
    const childCount = await prisma.category.count({ where: { parentId: categoryId, userId } });
    if (childCount > 0) {
      throw new HttpError(400, "A category with subcategories cannot be moved under another category");
    }
  }

  return parentId;
}

/** Materializes DEFAULT_CATEGORIES into real Category rows for a brand-new user, so every account
 * starts with a ready-made category tree (and the import auto-routing its cat-id mappings
 * enable) with zero manual setup -- see routes/auth.ts's /register. Takes a Prisma client so the
 * caller can run it inside the same transaction as the user's own creation, keeping "account
 * exists" and "account has its starter categories" atomic. */
export async function seedDefaultCategories(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  async function createNode(node: DefaultCategoryNode, parentId: string | null, position: number): Promise<void> {
    const category = await tx.category.create({
      data: {
        userId,
        name: node.name,
        tags: node.tags ?? [],
        parentId,
        position,
        metaTitle: node.metaTitle ?? null,
        metaDescription: node.metaDescription ?? null,
        makerworldCatIds: node.makerworldCatIds ?? [],
        thingiverseCatIds: node.thingiverseCatIds ?? [],
        printablesCatIds: node.printablesCatIds ?? [],
      },
    });
    let i = 0;
    for (const child of node.children ?? []) {
      await createNode(child, category.id, i);
      i++;
    }
  }

  let i = 0;
  for (const root of DEFAULT_CATEGORIES) {
    await createNode(root, null, i);
    i++;
  }
}

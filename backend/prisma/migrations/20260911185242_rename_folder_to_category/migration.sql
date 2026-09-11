-- Renames the "Folder" domain entity to "Category" throughout: table, FK column, constraints,
-- and indexes. Uses RENAME everywhere (never DROP/CREATE) so every existing row, and the
-- partial index Print_root_nameNormalized_key (whose predicate references the renamed column),
-- survive untouched -- Postgres updates dependent object definitions automatically on rename,
-- it just doesn't rename their identifiers, which is what the statements below do by hand.

ALTER TABLE "Folder" RENAME TO "Category";
ALTER TABLE "Print" RENAME COLUMN "folderId" TO "categoryId";

ALTER TABLE "Category" RENAME CONSTRAINT "Folder_pkey" TO "Category_pkey";
ALTER TABLE "Category" RENAME CONSTRAINT "Folder_userId_fkey" TO "Category_userId_fkey";
ALTER TABLE "Category" RENAME CONSTRAINT "Folder_parentId_fkey" TO "Category_parentId_fkey";
ALTER TABLE "Print" RENAME CONSTRAINT "Print_folderId_fkey" TO "Print_categoryId_fkey";

ALTER INDEX "Folder_userId_parentId_position_idx" RENAME TO "Category_userId_parentId_position_idx";
ALTER INDEX "Folder_tags_idx" RENAME TO "Category_tags_idx";
ALTER INDEX "Folder_makerworldCatIds_idx" RENAME TO "Category_makerworldCatIds_idx";
ALTER INDEX "Folder_thingiverseCatIds_idx" RENAME TO "Category_thingiverseCatIds_idx";
ALTER INDEX "Folder_printablesCatIds_idx" RENAME TO "Category_printablesCatIds_idx";

ALTER INDEX "Print_userId_folderId_nameNormalized_key" RENAME TO "Print_userId_categoryId_nameNormalized_key";
ALTER INDEX "Print_userId_folderId_name_idx" RENAME TO "Print_userId_categoryId_name_idx";

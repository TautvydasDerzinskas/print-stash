-- A Folder's site-category matching now accepts several ids per site (e.g. a parent category
-- plus a couple of its subcategories), not just one. Converts each single-value *CatId column
-- into a *CatIds int array, preserving any value already set as a one-element array, then swaps
-- the old scalar indexes for GIN indexes suited to the array-overlap ("hasSome") queries
-- importService.ts's resolveFolderIdByCategory now runs.

ALTER TABLE "Folder" ADD COLUMN "makerworldCatIds" INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE "Folder" ADD COLUMN "thingiverseCatIds" INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE "Folder" ADD COLUMN "printablesCatIds" INTEGER[] NOT NULL DEFAULT '{}';

UPDATE "Folder" SET "makerworldCatIds" = ARRAY["makerworldCatId"] WHERE "makerworldCatId" IS NOT NULL;
UPDATE "Folder" SET "thingiverseCatIds" = ARRAY["thingiverseCatId"] WHERE "thingiverseCatId" IS NOT NULL;
UPDATE "Folder" SET "printablesCatIds" = ARRAY["printablesCatId"] WHERE "printablesCatId" IS NOT NULL;

DROP INDEX "Folder_userId_makerworldCatId_idx";
DROP INDEX "Folder_userId_thingiverseCatId_idx";
DROP INDEX "Folder_userId_printablesCatId_idx";

ALTER TABLE "Folder" DROP COLUMN "makerworldCatId";
ALTER TABLE "Folder" DROP COLUMN "thingiverseCatId";
ALTER TABLE "Folder" DROP COLUMN "printablesCatId";

CREATE INDEX "Folder_makerworldCatIds_idx" ON "Folder" USING GIN ("makerworldCatIds");
CREATE INDEX "Folder_thingiverseCatIds_idx" ON "Folder" USING GIN ("thingiverseCatIds");
CREATE INDEX "Folder_printablesCatIds_idx" ON "Folder" USING GIN ("printablesCatIds");

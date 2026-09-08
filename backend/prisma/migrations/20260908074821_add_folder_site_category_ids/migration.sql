-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "makerworldCatId" INTEGER,
ADD COLUMN     "printablesCatId" INTEGER,
ADD COLUMN     "thingiverseCatId" INTEGER;

-- CreateIndex
CREATE INDEX "Folder_userId_makerworldCatId_idx" ON "Folder"("userId", "makerworldCatId");

-- CreateIndex
CREATE INDEX "Folder_userId_thingiverseCatId_idx" ON "Folder"("userId", "thingiverseCatId");

-- CreateIndex
CREATE INDEX "Folder_userId_printablesCatId_idx" ON "Folder"("userId", "printablesCatId");

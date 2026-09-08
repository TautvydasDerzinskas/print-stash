-- DropIndex
DROP INDEX "Folder_userId_parentId_idx";

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Folder_userId_parentId_position_idx" ON "Folder"("userId", "parentId", "position");

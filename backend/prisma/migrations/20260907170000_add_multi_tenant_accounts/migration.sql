-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- DropIndex
DROP INDEX "Folder_parentId_idx";

-- DropIndex
DROP INDEX "Print_folderId_nameNormalized_key";

-- DropIndex
DROP INDEX "Print_folderId_name_idx";

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Print" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Folder_userId_parentId_idx" ON "Folder"("userId", "parentId");

-- CreateIndex
CREATE INDEX "Print_userId_folderId_name_idx" ON "Print"("userId", "folderId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Print_userId_folderId_nameNormalized_key" ON "Print"("userId", "folderId", "nameNormalized");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Print" ADD CONSTRAINT "Print_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
-- The root-level (folderId IS NULL) partial unique index predates multi-tenancy and
-- enforced nameNormalized uniqueness globally. Rescope it to per-user, matching the
-- composite unique index above.
DROP INDEX "Print_root_nameNormalized_key";

-- CreateIndex
CREATE UNIQUE INDEX "Print_root_nameNormalized_key" ON "Print"("userId", "nameNormalized") WHERE "folderId" IS NULL;


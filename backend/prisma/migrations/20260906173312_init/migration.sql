-- CreateEnum
CREATE TYPE "PrintFileRole" AS ENUM ('SUPPORTING', 'PREPARED');

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Print" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "creator" TEXT,
    "collection" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "folderId" TEXT,
    "sourcePath" TEXT,
    "preparedFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Print_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plate" (
    "id" TEXT NOT NULL,
    "printId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "sourcePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintFile" (
    "id" TEXT NOT NULL,
    "printId" TEXT NOT NULL,
    "role" "PrintFileRole" NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "Folder_tags_idx" ON "Folder" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Print_preparedFileId_key" ON "Print"("preparedFileId");

-- CreateIndex
CREATE INDEX "Print_folderId_name_idx" ON "Print"("folderId", "name");

-- CreateIndex
CREATE INDEX "Print_tags_idx" ON "Print" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Print_folderId_nameNormalized_key" ON "Print"("folderId", "nameNormalized");

-- CreateIndex
-- Postgres multi-column unique indexes never conflict when any indexed column is NULL,
-- so the composite index above does not stop two root-level (folderId IS NULL) prints
-- from sharing a name. This partial index enforces per-folder name uniqueness at the root too.
CREATE UNIQUE INDEX "Print_root_nameNormalized_key" ON "Print"("nameNormalized") WHERE "folderId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Plate_storagePath_key" ON "Plate"("storagePath");

-- CreateIndex
CREATE INDEX "Plate_printId_idx" ON "Plate"("printId");

-- CreateIndex
CREATE UNIQUE INDEX "Plate_printId_position_key" ON "Plate"("printId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PrintFile_storagePath_key" ON "PrintFile"("storagePath");

-- CreateIndex
CREATE INDEX "PrintFile_printId_role_idx" ON "PrintFile"("printId", "role");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Print" ADD CONSTRAINT "Print_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Print" ADD CONSTRAINT "Print_preparedFileId_fkey" FOREIGN KEY ("preparedFileId") REFERENCES "PrintFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plate" ADD CONSTRAINT "Plate_printId_fkey" FOREIGN KEY ("printId") REFERENCES "Print"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintFile" ADD CONSTRAINT "PrintFile_printId_fkey" FOREIGN KEY ("printId") REFERENCES "Print"("id") ON DELETE CASCADE ON UPDATE CASCADE;

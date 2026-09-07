-- AlterTable
ALTER TABLE "Print" ADD COLUMN     "authorId" TEXT;

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "handle" TEXT,
    "bio" TEXT,
    "bioTranslated" TEXT,
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatarUrl" TEXT,
    "backgroundUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Author_provider_externalId_key" ON "Author"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Print_authorId_idx" ON "Print"("authorId");

-- AddForeignKey
ALTER TABLE "Print" ADD CONSTRAINT "Print_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE SET NULL ON UPDATE CASCADE;

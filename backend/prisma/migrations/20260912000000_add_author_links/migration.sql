-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "backgroundUrl" TEXT;

-- CreateTable
CREATE TABLE "AuthorLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorLink_authorId_key" ON "AuthorLink"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorLink_userId_provider_key" ON "AuthorLink"("userId", "provider");

-- AddForeignKey
ALTER TABLE "AuthorLink" ADD CONSTRAINT "AuthorLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorLink" ADD CONSTRAINT "AuthorLink_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE CASCADE ON UPDATE CASCADE;

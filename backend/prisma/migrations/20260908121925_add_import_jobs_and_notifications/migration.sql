-- CreateEnum
CREATE TYPE "ImportJobType" AS ENUM ('COLLECTION', 'ZIP');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('RUNNING', 'DONE', 'ERROR');

-- AlterTable
ALTER TABLE "Print" ADD COLUMN     "sourceExternalId" TEXT,
ADD COLUMN     "sourceProvider" TEXT;

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ImportJobType" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'RUNNING',
    "sourceUrl" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "provider" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "alreadyInLibrary" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "resultCollectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "externalUrl" TEXT,
    "internalPath" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_userId_status_idx" ON "ImportJob"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Print_userId_sourceProvider_sourceExternalId_key" ON "Print"("userId", "sourceProvider", "sourceExternalId");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

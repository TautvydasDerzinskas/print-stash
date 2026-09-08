-- AlterTable
ALTER TABLE "Print" ADD COLUMN     "favoritedAt" TIMESTAMP(3),
ADD COLUMN     "lastViewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Print_userId_favoritedAt_idx" ON "Print"("userId", "favoritedAt");

-- CreateIndex
CREATE INDEX "Print_userId_lastViewedAt_idx" ON "Print"("userId", "lastViewedAt");

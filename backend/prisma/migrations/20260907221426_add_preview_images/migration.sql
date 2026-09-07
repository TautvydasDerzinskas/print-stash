-- CreateTable
CREATE TABLE "PreviewImage" (
    "id" TEXT NOT NULL,
    "printId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreviewImage_printId_idx" ON "PreviewImage"("printId");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewImage_printId_position_key" ON "PreviewImage"("printId", "position");

-- AddForeignKey
ALTER TABLE "PreviewImage" ADD CONSTRAINT "PreviewImage_printId_fkey" FOREIGN KEY ("printId") REFERENCES "Print"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;

-- AlterTable
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Asset_archivedAt_idx" ON "Asset"("archivedAt");
-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "returnImageKey" TEXT,
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnedById" TEXT;

-- CreateIndex
CREATE INDEX "Assignment_returnedById_idx" ON "Assignment"("returnedById");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

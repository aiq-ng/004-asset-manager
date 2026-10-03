-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "assignedById" TEXT;

-- CreateIndex
CREATE INDEX "Assignment_assignedById_idx" ON "Assignment"("assignedById");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

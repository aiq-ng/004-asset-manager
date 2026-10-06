-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "passwordCiphertext" TEXT,
ADD COLUMN     "passwordSetAt" TIMESTAMP(3),
ADD COLUMN     "passwordSetById" TEXT;

-- AlterTable
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_passwordSetById_fkey" FOREIGN KEY ("passwordSetById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "brand" TEXT;

-- AlterTable
ALTER TABLE "Department" ALTER COLUMN "updatedAt" DROP DEFAULT;

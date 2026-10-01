-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('USER', 'ASSIGNER', 'ADMIN', 'SUPERADMIN');

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "role" "StaffRole" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "Staff_role_idx" ON "Staff"("role");

-- Backfill: existing rows all land on USER, which would leave a database with
-- no one able to manage the catalog. Promote the oldest account to ADMIN so an
-- installed database is usable; SUPERADMIN is never set here, it is only ever
-- granted by `pnpm auth:create-superadmin`.
UPDATE "Staff" SET "role" = 'ADMIN'
WHERE "id" = (SELECT "id" FROM "Staff" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);